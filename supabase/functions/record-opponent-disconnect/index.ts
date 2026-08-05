import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  // CORS対応
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { opponent_id } = await req.json()

    if (!opponent_id) {
      return new Response(
        JSON.stringify({ error: 'opponent_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Service Role Keyを使用してRLSをバイパス
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 相手の現在の切断回数を取得
    const { data: current, error: selectError } = await supabaseAdmin
      .from('players')
      .select('online_disconnect')
      .eq('id', opponent_id)
      .single()

    if (selectError) {
      console.error('Select error:', selectError)
      return new Response(
        JSON.stringify({ error: 'Failed to get player data' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 切断回数をインクリメント
    const { error: updateError } = await supabaseAdmin
      .from('players')
      .update({
        online_disconnect: (current?.online_disconnect || 0) + 1
      })
      .eq('id', opponent_id)

    if (updateError) {
      console.error('Update error:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update disconnect count' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
