import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ypcrwnsrvhmlktsxdiiv.supabase.co'
const supabaseKey = 'sb_publishable_3o8TWun6VZQUVgDx-ZFsQA_ZCfXe7NB' 

export const supabase = createClient(supabaseUrl, supabaseKey)