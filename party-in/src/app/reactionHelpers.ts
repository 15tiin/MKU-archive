import { supabase } from './supabaseClient';

// Get or create user ID
export const getUserId = (): string => {
  let userId = localStorage.getItem('mku_user_id');
  if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem('mku_user_id', userId);
  }
  return userId;
};

// Add or update reaction
export const handleReaction = async (photoUrl: string, emoji: string) => {
  const userId = getUserId();

  // Check if user already reacted to this photo
  const { data: existing } = await supabase
    .from('photo_reactions')
    .select('*')
    .eq('photo_url', photoUrl)
    .eq('user_id', userId)
    .single();

  if (existing) {
    if (existing.emoji === emoji) {
      // Same emoji clicked = Remove reaction (toggle off)
      await supabase
        .from('photo_reactions')
        .delete()
        .eq('photo_url', photoUrl)
        .eq('user_id', userId);
      return null;
    } else {
      // Different emoji = Update reaction
      await supabase
        .from('photo_reactions')
        .update({ emoji })
        .eq('photo_url', photoUrl)
        .eq('user_id', userId);
      return emoji;
    }
  } else {
    // First reaction = Insert new
    await supabase
      .from('photo_reactions')
      .insert({ photo_url: photoUrl, user_id: userId, emoji });
    return emoji;
  }
};

// Get reaction counts for a photo
export const getReactionCounts = async (photoUrl: string) => {
  const { data } = await supabase
    .from('photo_reactions')
    .select('emoji')
    .eq('photo_url', photoUrl);

  const counts = {
    '🔥': 0,
    '😂': 0,
    '👑': 0,
    '💪': 0,
    '💀': 0,
    '👎': 0
  };

  data?.forEach((r: any) => {
    if (counts.hasOwnProperty(r.emoji)) {
      counts[r.emoji as keyof typeof counts]++;
    }
  });

  return counts;
};

// Get user's current reaction for a photo
export const getUserReaction = async (photoUrl: string) => {
  const userId = getUserId();
  const { data } = await supabase
    .from('photo_reactions')
    .select('emoji')
    .eq('photo_url', photoUrl)
    .eq('user_id', userId)
    .single();

  return data?.emoji || null;
};

// Get top 3 most-used emojis for a photo
export const getTopEmojis = (counts: Record<string, number>): string[] => {
  return Object.entries(counts)
    .filter(([_, count]) => count > 0)
    .sort(([_, a], [__, b]) => b - a)
    .slice(0, 3)
    .map(([emoji]) => emoji);
};

// Get total reaction count
export const getTotalCount = (counts: Record<string, number>): number => {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
};