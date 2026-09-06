// supabase/functions/manage-player/index.ts
// Управление игроками в сессии (удаление/исключение участников Создателем сессии)
// Работает с SUPABASE_SERVICE_ROLE_KEY, проверяя права вызывающего пользователя.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Авторизация инициатора по переданному токену
    const authHeader = req.headers.get("Authorization");
    let callerUserId: string | null = null;

    if (authHeader) {
      const userClient = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userClient.auth.getUser();
      callerUserId = userData?.user?.id || null;
    }

    const body = await req.json().catch(() => ({}));
    const { action, sessionId, playerId } = body;

    if (action !== "remove_player" || !sessionId || !playerId) {
      return new Response(
        JSON.stringify({ success: false, error: "Неверные параметры запроса: требуются action, sessionId, playerId" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // 1. Проверяем существование сессии и определяем создателя мира
    const { data: sessionData, error: sessionErr } = await adminClient
      .from("sessions")
      .select("id, world_id, worlds(owner_id)")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionErr || !sessionData) {
      return new Response(
        JSON.stringify({ success: false, error: "Сессия не найдена" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const worldOwnerId = (sessionData.worlds as any)?.owner_id;

    // 2. Находим целевого игрока в сессии
    const { data: playerData, error: playerErr } = await adminClient
      .from("players")
      .select("id, name, user_id")
      .eq("id", playerId)
      .eq("session_id", sessionId)
      .maybeSingle();

    if (playerErr || !playerData) {
      return new Response(
        JSON.stringify({ success: false, error: "Игрок не найден в данной сессии" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // 3. Проверка прав: инициатор должен быть создателем мира или самим игроком
    if (callerUserId && callerUserId !== worldOwnerId && callerUserId !== playerData.user_id) {
      return new Response(
        JSON.stringify({ success: false, error: "У вас нет прав на удаление этого участника" }),
        { status: 403, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const playerName = playerData.name || "Игрок";

    // 4. Каскадное удаление данных игрока через adminClient (bypasses RLS)
    try {
      await adminClient.from("turn_queue").delete().eq("player_id", playerId);
    } catch {}

    try {
      await adminClient.from("player_injuries").delete().eq("player_id", playerId);
    } catch {}

    try {
      await adminClient.from("player_skills").delete().eq("player_id", playerId);
    } catch {}

    try {
      await adminClient.from("inventory").delete().eq("player_id", playerId);
    } catch {}

    const { error: delErr } = await adminClient.from("players").delete().eq("id", playerId);
    if (delErr) {
      return new Response(
        JSON.stringify({ success: false, error: `Ошибка при удалении игрока: ${delErr.message}` }),
        { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // 5. Системное сообщение в сессию
    try {
      await adminClient.from("messages").insert({
        session_id: sessionId,
        sender_type: "system",
        sender_name: "Система",
        content: `🚪 Участник «${playerName}» был исключен из сессии Создателем.`,
      });
    } catch {}

    return new Response(
      JSON.stringify({ success: true, player_id: playerId, player_name: playerName }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || String(err) }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
