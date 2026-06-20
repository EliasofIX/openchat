// Normalize common LaTeX formats from LLM output into remark-math syntax.
//
// Models frequently use \(...\), \[...\], or ```latex fences instead of $ / $$.

const FENCED_BLOCK = /(```[\s\S]*?```)/g;

function convertLatexFence(block: string): string {
  const match = block.match(/^```(latex|tex|math)\s*\n([\s\S]*?)```$/i);
  if (!match) return block;
  return `\n$$\n${match[2].trim()}\n$$\n`;
}

function convertDelimiters(segment: string): string {
  return segment
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => `\n$$\n${math.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => `$${math.trim()}$`);
}

export function preprocessMathMarkdown(content: string): string {
  return content
    .split(FENCED_BLOCK)
    .map((segment, index) => {
      if (index % 2 === 1) return convertLatexFence(segment);
      return convertDelimiters(segment);
    })
    .join("");
}
