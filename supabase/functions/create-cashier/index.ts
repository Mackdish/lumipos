import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
  if (!supabaseUrl || !serviceRoleKey || !anonKey) return json({ error: "Server authentication is not configured" }, 500);

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user: caller }, error: userError } = await callerClient.auth.getUser();
  if (userError || !caller) return json({ error: "Invalid authentication" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: membership, error: membershipError } = await admin
    .from("hotel_memberships")
    .select("hotel_id, role")
    .eq("user_id", caller.id)
    .eq("status", "active")
    .in("role", ["owner", "manager"])
    .maybeSingle();
  if (membershipError || !membership) return json({ error: "Only hotel owners and managers can create cashiers" }, 403);

  let body: { full_name?: string; email?: string; password?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const fullName = body.full_name?.trim();
  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim() || generatePassword();
  if (!fullName || fullName.length < 2) return json({ error: "Cashier name is required" }, 400);
  if (!email || !email.includes("@")) return json({ error: "A valid cashier email is required" }, 400);
  if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
  if (createError || !created.user) return json({ error: createError?.message || "Unable to create cashier" }, 400);

  const cashierId = created.user.id;
  const { error: profileError } = await admin.from("profiles").upsert({ id: cashierId, full_name: fullName, email, job_title: "Cashier", approval_status: "approved" });
  const { error: memberError } = await admin.from("hotel_memberships").insert({ hotel_id: membership.hotel_id, user_id: cashierId, role: "cashier", status: "active" });
  const { error: roleError } = await admin.from("user_roles").insert({ user_id: cashierId, role: "staff" });

  if (profileError || memberError || roleError) {
    await admin.auth.admin.deleteUser(cashierId);
    return json({ error: "Cashier account could not be completed. No account was created." }, 500);
  }

  // Optional Resend delivery. Credentials are still returned once to the manager
  // so they can securely copy them if email delivery is not configured.
  let emailSent = false;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("FROM_EMAIL");
  if (resendKey && fromEmail) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromEmail, to: [email], subject: "Your TillBook cashier login", html: `<p>Hello ${fullName},</p><p>Your cashier account for the hotel has been created.</p><p><strong>Email:</strong> ${email}<br><strong>Temporary password:</strong> ${password}</p><p>Please sign in to TillBook and change your password after your first login.</p>` }),
    });
    emailSent = response.ok;
  }

  return json({ success: true, cashier: { id: cashierId, full_name: fullName, email }, temporary_password: password, email_sent: emailSent });
});
