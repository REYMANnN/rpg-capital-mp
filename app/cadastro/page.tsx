'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

const pfSchema = z.object({
  name: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  cpf: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos'),
  pin: z.string().regex(/^\d{4}$/, 'PIN deve ter 4 dígitos'),
})

const pjSchema = pfSchema.extend({
  business_name: z.string().min(2, 'Nome da empresa obrigatório'),
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos'),
  admin_password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
})

type PFForm = z.infer<typeof pfSchema>
type PJForm = z.infer<typeof pjSchema>

export default function CadastroPage() {
  const searchParams = useSearchParams()
  const type = searchParams.get('type') === 'pj' ? 'pj' : 'pf'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<'form' | 'mp'>('form')
  const [userData, setUserData] = useState<{ userId: string } | null>(null)

  const schema = type === 'pj' ? pjSchema : pfSchema
  const { register, handleSubmit, formState: { errors } } = useForm<PJForm>({
    resolver: zodResolver(schema as any),
  })

  const onSubmit = async (data: PJForm | PFForm) => {
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()

      // Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: (data as any).cpf + (data as any).pin,
        options: {
          data: {
            name: data.name,
            account_type: type,
          }
        }
      })

      if (authError) throw new Error(authError.message)
      if (!authData.user) throw new Error('Erro ao criar conta')

      // Store user data via API
      const res = await fetch('/api/user/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: authData.user.id,
          name: data.name,
          email: data.email,
          cpf: (data as any).cpf,
          account_type: type,
          pin: (data as any).pin,
          ...(type === 'pj' && {
            business_name: (data as PJForm).business_name,
            cnpj: (data as PJForm).cnpj,
            admin_password: (data as PJForm).admin_password,
          })
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erro ao salvar dados')
      }

      setUserData({ userId: authData.user.id })
      setStep('mp')
    } catch (e: any) {
      setError(e.message || 'Erro desconhecido')
    } finally {
      setLoading(false)
    }
  }

  const handleMPConnect = () => {
    const clientId = process.env.NEXT_PUBLIC_MP_CLIENT_ID || '7262197185599412'
    const redirectUri = encodeURIComponent(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/callback`)
    const state = encodeURIComponent(JSON.stringify({ type, userId: userData?.userId }))
    const mpUrl = `https://auth.mercadopago.com/authorization?client_id=${clientId}&response_type=code&platform_id=mp&redirect_uri=${redirectUri}&state=${state}`
    window.location.href = mpUrl
  }

  return (
    <div className="min-h-screen bg-[#0057d2] flex flex-col items-center justify-center px-4 py-12">
      <div className="mb-8">
        <Logo size="lg" />
      </div>

      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader>
          <CardTitle className="text-2xl font-black text-[#0057d2]">
            {step === 'form'
              ? type === 'pj' ? 'Cadastro de Lojista' : 'Criar conta'
              : 'Conectar Mercado Pago'}
          </CardTitle>
          <CardDescription>
            {step === 'form'
              ? type === 'pj'
                ? 'Preencha os dados da sua empresa'
                : 'Preencha seus dados pessoais'
              : 'Para pagamentos, conecte sua conta Mercado Pago'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'form' ? (
            <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
              <div>
                <Label htmlFor="name">Nome completo</Label>
                <Input id="name" placeholder="João Silva" {...register('name')} />
                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
              </div>

              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="joao@email.com" {...register('email')} />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <Label htmlFor="cpf">CPF (somente números)</Label>
                <Input id="cpf" placeholder="00000000000" maxLength={11} {...register('cpf')} />
                {errors.cpf && <p className="text-red-500 text-xs mt-1">{errors.cpf.message}</p>}
              </div>

              {type === 'pj' && (
                <>
                  <div>
                    <Label htmlFor="business_name">Nome da Empresa</Label>
                    <Input id="business_name" placeholder="Minha Loja LTDA" {...register('business_name' as any)} />
                    {(errors as any).business_name && (
                      <p className="text-red-500 text-xs mt-1">{(errors as any).business_name.message}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="cnpj">CNPJ (somente números)</Label>
                    <Input id="cnpj" placeholder="00000000000000" maxLength={14} {...register('cnpj' as any)} />
                    {(errors as any).cnpj && (
                      <p className="text-red-500 text-xs mt-1">{(errors as any).cnpj.message}</p>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="admin_password">Senha do Terminal</Label>
                    <Input id="admin_password" type="password" placeholder="Senha para vincular terminais" {...register('admin_password' as any)} />
                    {(errors as any).admin_password && (
                      <p className="text-red-500 text-xs mt-1">{(errors as any).admin_password.message}</p>
                    )}
                  </div>
                </>
              )}

              <div>
                <Label htmlFor="pin">PIN de Pagamento (4 dígitos)</Label>
                <Input id="pin" type="password" placeholder="••••" maxLength={4} {...register('pin')} />
                {errors.pin && <p className="text-red-500 text-xs mt-1">{errors.pin.message}</p>}
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-600 text-sm">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-[#0057d2] hover:bg-[#0046b0] text-white font-bold py-3 rounded-xl"
              >
                {loading ? 'Cadastrando...' : 'Continuar'}
              </Button>
            </form>
          ) : (
            <div className="text-center space-y-6">
              <div className="bg-blue-50 rounded-2xl p-6">
                <div className="text-5xl mb-4">🏦</div>
                <p className="text-slate-700 text-sm leading-relaxed">
                  Para receber e enviar pagamentos, precisamos conectar sua conta do Mercado Pago.
                  Isso é seguro e você pode desconectar a qualquer momento.
                </p>
              </div>

              <Button
                onClick={handleMPConnect}
                className="w-full bg-[#ffde00] hover:bg-yellow-300 text-[#0a0a0a] font-bold py-4 rounded-xl text-lg"
              >
                Conectar com Mercado Pago
              </Button>

              <p className="text-xs text-slate-500">
                Você será redirecionado para o Mercado Pago para autorizar o acesso.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
