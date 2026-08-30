import { redirect } from 'next/navigation'

export default function Home() {
  redirect(process.env.BALCAO_ACCOUNTS_ENFORCED === 'true' ? '/login' : '/inventory-v1')
}
