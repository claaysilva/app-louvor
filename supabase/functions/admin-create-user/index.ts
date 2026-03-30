import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: "Configuracao de ambiente incompleta" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return new Response(JSON.stringify({ error: "Token ausente" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: authUserData, error: authUserError } = await adminClient.auth.getUser(token);
    if (authUserError || !authUserData.user) {
      return new Response(JSON.stringify({ error: `Nao autenticado: ${authUserError?.message ?? "token invalido"}` }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requesterEmail = (authUserData.user.email ?? "").toLowerCase();

    const { data: requesterProfile } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", authUserData.user.id)
      .maybeSingle();

    const isAdmin = requesterProfile?.role === "admin" || requesterEmail === "claytonpetry1@gmail.com";
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Not admin" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const nome = String(body?.nome ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!nome || !email || password.length < 6) {
      return new Response(JSON.stringify({ error: "Dados invalidos: nome, email e senha >= 6" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome },
    });

    if (createError || !created.user) {
      return new Response(JSON.stringify({ error: createError?.message || "Falha ao criar usuario" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await adminClient
      .from("profiles")
      .upsert(
        {
          id: created.user.id,
          nome,
          email,
          role: "user",
        },
        { onConflict: "id" },
      );

    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          id: created.user.id,
          email,
          nome,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Erro interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
