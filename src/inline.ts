// Tiny inline formatter for editor-friendly text fields.
//   ==text==      highlighted phrase      [1]   citation link to #src-1
//   [label](url)  link                    **x** bold
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function inline(text = ''): string {
  return esc(text)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => `<a href="${url}">${label}</a>`)
    .replace(/==(.+?)==/g, '<span class="mark">$1</span>')
    .replace(/\[(\d{1,2})\]/g, '<a class="cite" href="#src-$1" aria-label="Source $1">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}
