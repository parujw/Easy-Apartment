/** "101-105, 201, 202" → ["101","102",…,"201","202"] */
export function parseRoomNumbers(s: string): string[] {
  const out: string[] = [];
  for (const part of s.split(/[,\s]+/).filter(Boolean)) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m && Number(m[2]) >= Number(m[1]) && Number(m[2]) - Number(m[1]) < 200) {
      for (let i = Number(m[1]); i <= Number(m[2]); i++) out.push(String(i).padStart(m[1].length, "0"));
    } else out.push(part);
  }
  return [...new Set(out)];
}
