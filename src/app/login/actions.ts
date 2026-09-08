import { createClient } from "@/lib/supabase/client"

export async function login(formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  const supabase = createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return error.message
  }
  
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('status').eq('id', user.id).single()
    if (profile?.status === 'pending') {
      if (typeof window !== 'undefined') window.location.href = "/waiting-approval"
      return null
    }
  }

  if (typeof window !== 'undefined') window.location.href = "/"
  return null
}

export async function signup(formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const supabase = createClient()

  const { error } = await supabase.auth.signUp({
    email,
    password,
  })

  if (error) {
    return error.message
  }
  
  // New users are pending by default
  if (typeof window !== 'undefined') window.location.href = "/waiting-approval"
  return null
}

export async function logout() {
  const supabase = createClient()
  await supabase.auth.signOut()
  if (typeof window !== 'undefined') window.location.href = "/login"
}
