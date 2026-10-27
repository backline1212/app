/** "Kim Lee" → "KL", "Northwind Traders" → "NT", "Kim" → "KI". */
export function nameInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
  return (words[0] ?? "").slice(0, 2).toUpperCase();
}
