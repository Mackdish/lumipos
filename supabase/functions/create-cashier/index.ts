import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const value = error as { message?: string; details?: string; hint?: string; code?: string };
    return [value.message, value.details, value.hint, value.code ? `code=${value.code}` : ""]
      .filter(Boolean)
      .join(" | ") || fallback;
  }
  return fallback;
}

function generatePassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let cashierId: string | null = null;
  let admin: ReturnType<typeof createClient> | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Authentication required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: "Server authentication is not configured" }, 500);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: userError } = await callerClient.auth.getUser();
    if (userError || !authData.user) {
      return json({ error: `Invalid authentication: ${errorMessage(userError, "session is invalid")}` }, 401);
    }

    admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: membership, error: membershipError } = await admin
      .from("hotel_memberships")
      .select("hotel_id, role, hotels(name)")
      .eq("user_id", authData.user.id)
      .eq("status", "active")
      .in("role", ["owner", "manager"])
      .maybeSingle();

    if (membershipError) {
      return json({ error: `Unable to verify hotel membership: ${errorMessage(membershipError, "membership lookup failed")}` }, 403);
    }
    if (!membership) {
      return json({ error: "Only hotel owners and managers can create cashiers" }, 403);
    }

    let body: { full_name?: string; email?: string; password?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const fullName = body.full_name?.trim();
    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim() || generatePassword();

    if (!fullName || fullName.length < 2) return json({ error: "Cashier name is required" }, 400);
    if (!email || !email.includes("@")) return json({ error: "A valid cashier email is required" }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

    const { data: existingUsers, error: existingError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (existingError) {
      return json({ error: `Unable to check existing accounts: ${errorMessage(existingError, "user lookup failed")}` }, 500);
    }
    if (existingUsers.users.some((user) => user.email?.toLowerCase() === email)) {
      return json({ error: "A user with this email already exists. Use a different email address." }, 409);
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError || !created.user) {
      return json({ error: `Unable to create cashier account: ${errorMessage(createError, "Auth user creation failed")}` }, 400);
    }
    cashierId = created.user.id;

    const { error: profileError } = await admin.from("profiles").upsert(
      {
        id: cashierId,
        full_name: fullName,
        email,
        job_title: "Cashier",
        approval_status: "approved",
      },
      { onConflict: "id" },
    );
    if (profileError) {
      await admin.auth.admin.deleteUser(cashierId);
      cashierId = null;
      return json({ error: `Cashier profile could not be created: ${errorMessage(profileError, "profile setup failed")}` }, 500);
    }

    const { error: memberError } = await admin.from("hotel_memberships").insert({
      hotel_id: membership.hotel_id,
      user_id: cashierId,
      role: "cashier",
      status: "active",
    });
    if (memberError) {
      await admin.auth.admin.deleteUser(cashierId);
      cashierId = null;
      return json({ error: `Cashier hotel membership could not be created: ${errorMessage(memberError, "membership setup failed")}` }, 500);
    }

    const { error: roleError } = await admin.from("user_roles").upsert(
      {
        user_id: cashierId,
        hotel_id: membership.hotel_id,
        role: "staff",
      },
      { onConflict: "user_id,hotel_id,role" },
    );
    if (roleError) {
      await admin.from("hotel_memberships").delete().eq("hotel_id", membership.hotel_id).eq("user_id", cashierId);
      await admin.auth.admin.deleteUser(cashierId);
      cashierId = null;
      return json({ error: `Cashier role could not be created: ${errorMessage(roleError, "role setup failed")}` }, 500);
    }

    let emailSent = false;
    let emailError: string | null = null;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("FROM_EMAIL");
    const hotelName = Array.isArray((membership as any).hotels)
      ? (membership as any).hotels[0]?.name || "your hotel"
      : (membership as any).hotels?.name || "your hotel";

    if (resendKey && fromEmail) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: "Your TillBook cashier login",
            html: `<p>Hello ${fullName},</p><p>Your TillBook cashier account has been created for <strong>${hotelName}</strong>.</p><p><strong>Email:</strong> ${email}<br><strong>Temporary password:</strong> ${password}</p><p>Please change your password after your first login.</p>`,
          }),
        });
        emailSent = response.ok;
        if (!response.ok) emailError = await response.text();
      } catch (error) {
        emailError = errorMessage(error, "Email delivery failed");
      }
    }

    return json({
      success: true,
      cashier: { id: cashierId, full_name: fullName, email },
      temporary_password: password,
      email_sent: emailSent,
      email_error: emailError,
    });
  } catch (error) {
    if (cashierId && admin) {
      try {
        await admin.from("hotel_memberships").delete().eq("user_id", cashierId);
        await admin.from("user_roles").delete().eq("user_id", cashierId);
        await admin.auth.admin.deleteUser(cashierId);
      } catch {
        // Best-effort rollback only.
      }
    }
    return json({ error: `Cashier creation failed: ${errorMessage(error, "Unexpected server error")}` }, 500);
  }
});
