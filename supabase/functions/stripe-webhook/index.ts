import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

// Stripe署名検証（簡易版）
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const parts = signature.split(',')
  const timestamp = parts.find(p => p.startsWith('t='))?.split('=')[1]
  const v1Signature = parts.find(p => p.startsWith('v1='))?.split('=')[1]

  if (!timestamp || !v1Signature) return false

  const signedPayload = `${timestamp}.${payload}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload))
  const expectedSig = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  return expectedSig === v1Signature
}

Deno.serve(async (req) => {
  try {
    const body = await req.text()
    const signature = req.headers.get('stripe-signature')

    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'No signature' }),
        { status: 400 }
      )
    }

    // 署名検証
    const isValid = await verifyStripeSignature(body, signature, STRIPE_WEBHOOK_SECRET)
    if (!isValid) {
      console.error('Invalid signature')
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 400 }
      )
    }

    const event = JSON.parse(body)
    console.log('Webhook event:', event.type)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object
      const userId = session.metadata?.user_id
      const amount = session.amount_total

      if (!userId) {
        console.error('No user_id in metadata')
        return new Response(
          JSON.stringify({ error: 'No user_id' }),
          { status: 400 }
        )
      }

      console.log(`Processing payment for user ${userId}, amount: ${amount}`)

      // Service Role Keyを使用してRLSをバイパス
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      // 既存の累計金額を取得
      const { data: existing } = await supabaseAdmin
        .from('users_premiums')
        .select('total_amount')
        .eq('user_id', userId)
        .maybeSingle()

      const currentTotal = existing?.total_amount || 0

      // users_premiumsテーブルを更新（累計金額に加算）
      const { error } = await supabaseAdmin
        .from('users_premiums')
        .upsert({
          user_id: userId,
          is_premium: true,
          purchased_at: new Date().toISOString(),
          total_amount: currentTotal + amount,
          last_transaction_id: session.id,
          payment_provider: 'stripe'
        })

      if (error) {
        console.error('Database error:', error)
        return new Response(
          JSON.stringify({ error: 'Database error' }),
          { status: 500 }
        )
      }

      console.log(`User ${userId} is now premium`)
    }

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: 'Webhook error' }),
      { status: 500 }
    )
  }
})
