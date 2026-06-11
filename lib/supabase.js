import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
)

export const SUBMISSIONS_BUCKET = process.env.SUPABASE_SUBMISSIONS_BUCKET || 'submissions'

export default supabase
