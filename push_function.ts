// Supabase Edge Function "push"
// Dashboard -> Edge Functions -> Deploy a new function -> имя: push -> вставить этот код

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

webpush.setVapidDetails(
  'mailto:whereapp@example.com',
  Deno.env.get('VAPID_PUBLIC')!,
  Deno.env.get('VAPID_PRIVATE')!
)

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { to, title, body } = await req.json()
    if (!Array.isArray(to) || !to.length) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }

    const { data } = await sb.from('push_subs').select('endpoint, sub').in('uid', to)
    let sent = 0

    await Promise.all((data || []).map(async (r: any) => {
      try {
        await webpush.sendNotification(r.sub, JSON.stringify({ title, body }))
        sent++
      } catch (e: any) {
        // подписка протухла — убираем
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await sb.from('push_subs').delete().eq('endpoint', r.endpoint)
        }
      }
    }))

    return new Response(JSON.stringify({ sent }), { headers: { ...cors, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } })
  }
})
