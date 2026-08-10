// src/api/supabase.js — Клиент Supabase
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Auth helpers
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname + '#/',
    },
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
}

// Realtime subscription helper
export function subscribeToTable(table, filter, callback) {
  let channel = supabase
    .channel(`realtime:${table}`)
    .on('postgres_changes', { event: '*', schema: 'public', table, filter }, callback)
    .subscribe();

  return () => supabase.removeChannel(channel);
}

// Subscribe to session chat messages
export function subscribeToSessionMessages(sessionId, callback) {
  return subscribeToTable(
    'messages',
    `session_id=eq.${sessionId}`,
    (payload) => callback(payload)
  );
}

// Subscribe to session player updates (turn tracking)
export function subscribeToSessionPlayers(sessionId, callback) {
  return subscribeToTable(
    'players',
    `session_id=eq.${sessionId}`,
    (payload) => callback(payload)
  );
}
