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

function generatePassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

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

  const {
    data: { user: caller },
    error: userError,
  } = await callerClient.auth.getUser();

  if (userError || !caller) {
    return json({ error: "Invalid authentication" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Resolve the caller's active owner/manager membership without relying on
  // client-side RLS. Ordering avoids maybeSingle() failures if a user belongs
  // to more than one hotel.
  const { data: membership, error: membershipError } = await admin
    .from("hotel_memberships")
    .select("hotel_id, role")
    .eq("user_id", caller.id)
    .eq("status", "active")
    .in("role", ["owner", "manager"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    return json({
      error: "Could not verify hotel membership",
      details: membershipError.message,
      code: membershipError.code,
    }, 500);
  }

  if (!membership) {
    return json({ error: "Only hotel owners and managers can create cashiers" }, 403);
  }

  const { data: hotel, error: hotelError } = await admin
    .from("hotels")
    .select("id, name")
    .eq("id", membership.hotel_id)
    .maybeSingle();

  if (hotelError) {
    return json({
      error: "Could not load hotel profile",
      details: hotelError.message,
      code: hotelError.code,
    }, 500);
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

  if (!fullName || fullName.length < 2) {
    return json({ error: "Cashier name is required" }, 400);
  }
  if (!email || !email.includes("@")) {
    return json({ error: "A valid cashier email is required" }, 400);
  }
  if (password.length < 8) {
    return json({ error: "Password must be at least 8 characters" }, 400);
  }

  // Prevent accidentally creating a second hotel account for an existing auth user.
  const { data: existingUserData, error: existingUserError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (existingUserError) {
    return json({
      error: "Could not validate cashier email",
      details: existingUserError.message,
      code: existingUserError.code,
    }, 500);
  }

  const existingUser = existingUserData.users.find(
    (user) => user.email?.toLowerCase() === email,
  );

  if (existingUser) {
    return json({
      error: "A user with this email already exists. Use a different email address.",
    }, 409);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !created.user) {
    return json({
      error: createError?.message || "Unable to create cashier account",
      code: createError?.code,
    }, 400);
  }

  const cashierId = created.user.id;

  // Complete the database setup one step at a time so failures identify the
  // actual table/constraint causing the problem.
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
    return json({
      error: "Cashier profile could not be created",
      details: profileError.message,
      code: profileError.code,
      hint: profileError.hint,
    }, 500);
  }

  const { error: memberError } = await admin
    .from("hotel_memberships")
    .insert({
      hotel_id: membership.hotel_id,
      user_id: cashierId,
      role: "cashier",
      status: "active",
    });

  if (memberError) {
    await admin.from("profiles").delete().eq("id", cashierId);
    await admin.auth.admin.deleteUser(cashierId);
    return json({
      error: "Cashier hotel membership could not be created",
      details: memberError.message,
      code: memberError.code,
      hint: memberError.hint,
    }, 500);
  }

  // user_roles is retained for compatibility with existing TillBook role checks.
  // If this legacy record already exists, update it rather than failing the
  // entire cashier creation flow.
  const { error: roleError } = await admin
    .from("user_roles")
    .upsert(
      {
        user_id: cashierId,
        hotel_id: membership.hotel_id,
        role: "staff",
      },
      { onConflict: "user_id,hotel_id" },
    );

  if (roleError) {
    await admin.from("hotel_memberships").delete().eq("hotel_id", membership.hotel_id).eq("user_id", cashierId);
    await admin.from("profiles").delete().eq("id", cashierId);
    await admin.auth.admin.deleteUser(cashierId);
    return json({
      error: "Cashier role could not be created",
      details: roleError.message,
      code: roleError.code,
      hint: roleError.hint,
    }, 500);
  }

  let emailSent = false;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("FROM_EMAIL");

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
          html: `<p>Hello ${fullName},</p><p>Your TillBook cashier account has been created for <strong>${hotel?.name || "your hotel"}</strong>.</p><p><strong>Email:</strong> ${email}<br><strong>Temporary password:</strong> ${password}</p><p>Please change your password after your first login.</p>`,
        }),
      });
      emailSent = response.ok;
    } catch {
      // Email delivery is optional; the cashier account has already been created.
      emailSent = false;
    }
  }

  return json({
    success: true,
    cashier: {
      id: cashierId,
      full_name: fullName,
      email,
    },
    temporary_password: password,
    email_sent: emailSent,
  });
});
