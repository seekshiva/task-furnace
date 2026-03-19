import React from "react";

type InlineToken =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "link"; text: string; href: string }
  | { type: "strong"; tokens: InlineToken[] }
  | { type: "em"; tokens: InlineToken[] };

function tokenizeInline(input: string): InlineToken[] {
  // A small, pragmatic tokenizer (not a full markdown spec).
  // Order matters: code spans first so we don't style inside them.
  const tokens: InlineToken[] = [];

  const pushText = (value: string) => {
    if (!value) return;
    const last = tokens[tokens.length - 1];
    if (last?.type === "text") last.value += value;
    else tokens.push({ type: "text", value });
  };

  const parseStrongEm = (value: string): InlineToken[] => tokenizeInline(value);

  // Walk the string left-to-right, applying the first matching construct.
  let i = 0;
  while (i < input.length) {
    const rest = input.slice(i);

    // Inline code: `...`
    const codeMatch = rest.match(/^`([^`]+)`/);
    if (codeMatch) {
      tokens.push({ type: "code", value: codeMatch[1] ?? "" });
      i += codeMatch[0].length;
      continue;
    }

    // Link: [text](href)
    const linkMatch = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      tokens.push({
        type: "link",
        text: linkMatch[1] ?? "",
        href: linkMatch[2] ?? "",
      });
      i += linkMatch[0].length;
      continue;
    }

    // Strong: **text**
    const strongMatch = rest.match(/^\*\*([^*]+)\*\*/);
    if (strongMatch) {
      tokens.push({ type: "strong", tokens: parseStrongEm(strongMatch[1] ?? "") });
      i += strongMatch[0].length;
      continue;
    }

    // Emphasis: *text*
    const emMatch = rest.match(/^\*([^*]+)\*/);
    if (emMatch) {
      tokens.push({ type: "em", tokens: parseStrongEm(emMatch[1] ?? "") });
      i += emMatch[0].length;
      continue;
    }

    // Default: consume one character
    pushText(rest[0] ?? "");
    i += 1;
  }

  return tokens;
}

function renderInline(tokens: InlineToken[], keyPrefix: string): React.ReactNode[] {
  return tokens.map((t, idx) => {
    const key = `${keyPrefix}-${idx}`;
    if (t.type === "text") return <React.Fragment key={key}>{t.value}</React.Fragment>;
    if (t.type === "code") {
      return (
        <code
          key={key}
          className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-[1px] font-mono text-[12px] text-slate-900 dark:text-slate-200"
        >
          {t.value}
        </code>
      );
    }
    if (t.type === "link") {
      const safeHref = t.href;
      return (
        <a
          key={key}
          href={safeHref}
          target="_blank"
          rel="noreferrer"
          className="text-blue-700 dark:text-blue-400 underline decoration-blue-300 dark:decoration-blue-700 underline-offset-2 hover:decoration-blue-500 dark:hover:decoration-blue-500"
        >
          {t.text}
        </a>
      );
    }
    if (t.type === "strong") return <strong key={key}>{renderInline(t.tokens, key)}</strong>;
    if (t.type === "em") return <em key={key}>{renderInline(t.tokens, key)}</em>;
    return <React.Fragment key={key} />;
  });
}

type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { type: "paragraph"; lines: string[] }
  | { type: "code"; language: string | null; code: string }
  | { type: "ul"; items: string[] }
  | {
      type: "table";
      header: string[];
      align: Array<"left" | "center" | "right" | null>;
      rows: string[][];
    };

function looksLikeTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return false;
  // Exclude leading list markers.
  if (/^[-*]\s+/.test(trimmed)) return false;
  return true;
}

function splitTableRow(line: string): string[] {
  // Basic GFM-ish splitter. Does not support escaped pipes inside inline code.
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((c) => c.trim());
}

function parseAlignRow(line: string, columns: number): Array<"left" | "center" | "right" | null> {
  const cells = splitTableRow(line);
  const out: Array<"left" | "center" | "right" | null> = [];
  for (let i = 0; i < columns; i += 1) {
    const cell = (cells[i] ?? "").replace(/\s+/g, "");
    // Must contain at least one dash to qualify as separator.
    if (!/-/.test(cell)) {
      out.push(null);
      continue;
    }
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) out.push("center");
    else if (right) out.push("right");
    else if (left) out.push("left");
    else out.push(null);
  }
  return out;
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";

    // Code fence
    const fenceMatch = line.match(/^```(\w+)?\s*$/);
    if (fenceMatch) {
      const language = fenceMatch[1] ?? null;
      i += 1;
      const buf: string[] = [];
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        buf.push(lines[i] ?? "");
        i += 1;
      }
      // consume closing fence if present
      if (i < lines.length && (lines[i] ?? "").startsWith("```")) i += 1;
      blocks.push({ type: "code", language, code: buf.join("\n") });
      continue;
    }

    // Skip blank lines
    if (!line.trim()) {
      i += 1;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1]?.length ?? 1;
      blocks.push({
        type: "heading",
        level: Math.min(6, Math.max(1, level)) as 1 | 2 | 3 | 4 | 5 | 6,
        text: headingMatch[2] ?? "",
      });
      i += 1;
      continue;
    }

    // Unordered list
    const listItemMatch = line.match(/^[-*]\s+(.*)$/);
    if (listItemMatch) {
      const items: string[] = [];
      while (i < lines.length) {
        const li = (lines[i] ?? "").match(/^[-*]\s+(.*)$/);
        if (!li) break;
        items.push(li[1] ?? "");
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // Table: header row + separator row, then 0+ body rows.
    if (looksLikeTableRow(line) && looksLikeTableRow(lines[i + 1] ?? "")) {
      const header = splitTableRow(line);
      const separator = lines[i + 1] ?? "";
      const align = parseAlignRow(separator, header.length);
      // Validate separator row: all cells should be only :, -, and spaces.
      const sepCells = splitTableRow(separator);
      const isValidSep =
        sepCells.length > 0 &&
        sepCells.every((c) => /^[\s:-]+$/.test(c) && /-/.test(c.replace(/\s+/g, "")));
      if (isValidSep) {
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && looksLikeTableRow(lines[i] ?? "")) {
          const row = splitTableRow(lines[i] ?? "");
          rows.push(row);
          i += 1;
        }
        blocks.push({ type: "table", header, align, rows });
        continue;
      }
    }

    // Paragraph (collect consecutive non-blank, non-special lines)
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i] ?? "";
      if (!l.trim()) break;
      if (/^```/.test(l)) break;
      if (/^(#{1,6})\s+/.test(l)) break;
      if (/^[-*]\s+/.test(l)) break;
      para.push(l);
      i += 1;
    }
    blocks.push({ type: "paragraph", lines: para });
  }

  return blocks;
}

export function Markdown({ content, className }: { content: string; className?: string }) {
  const blocks = parseBlocks(content);
  return (
    <div className={["min-w-0 text-[13px] leading-[1.6] text-slate-900 dark:text-slate-100", className ?? ""].join(" ")}>
      {blocks.map((b, idx) => {
        if (b.type === "heading") {
          const levelClass =
            b.level <= 2
              ? "text-[15px] font-bold"
              : b.level === 3
                ? "text-[14px] font-bold"
                : "text-[13px] font-semibold";
          return (
            <div key={idx} className={["mt-3 first:mt-0", levelClass].join(" ")}>
              {renderInline(tokenizeInline(b.text), `h-${idx}`)}
            </div>
          );
        }

        if (b.type === "ul") {
          return (
            <ul key={idx} className="mt-2 list-disc space-y-1 pl-5 first:mt-0">
              {b.items.map((it, j) => (
                <li key={j} className="min-w-0 break-words">
                  {renderInline(tokenizeInline(it), `li-${idx}-${j}`)}
                </li>
              ))}
            </ul>
          );
        }

        if (b.type === "code") {
          return (
            <div key={idx} className="mt-2 overflow-hidden rounded-[12px] border border-slate-200 dark:border-slate-700 bg-slate-950 first:mt-0">
              {b.language && (
                <div className="border-b border-slate-800 px-3 py-2 text-[11px] font-semibold tracking-[0.04em] text-slate-300">
                  {b.language}
                </div>
              )}
              <pre className="overflow-x-auto px-3 py-2 text-[12px] leading-[1.55] text-slate-100">
                <code>{b.code}</code>
              </pre>
            </div>
          );
        }

        if (b.type === "table") {
          const colCount = Math.max(b.header.length, ...b.rows.map((r) => r.length));
          const colClass = (a: "left" | "center" | "right" | null) =>
            a === "center" ? "text-center" : a === "right" ? "text-right" : "text-left";
          return (
            <div
              key={idx}
              className="mt-2 overflow-x-auto rounded-[12px] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 first:mt-0"
            >
              <table className="min-w-full border-collapse text-[12px] leading-[1.5]">
                <thead className="bg-slate-50 dark:bg-slate-800/80">
                  <tr>
                    {Array.from({ length: colCount }).map((_, c) => (
                      <th
                        key={c}
                        className={[
                          "border-b border-slate-200 dark:border-slate-700 px-3 py-2 font-semibold text-slate-700 dark:text-slate-300",
                          colClass(b.align[c] ?? null),
                        ].join(" ")}
                      >
                        {renderInline(tokenizeInline(b.header[c] ?? ""), `th-${idx}-${c}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, rIdx) => (
                    <tr key={rIdx} className={rIdx % 2 === 0 ? "bg-white dark:bg-slate-800" : "bg-slate-50/40 dark:bg-slate-800/50"}>
                      {Array.from({ length: colCount }).map((_, c) => (
                        <td
                          key={c}
                          className={[
                            "border-b border-slate-100 dark:border-slate-700 px-3 py-2 align-top text-slate-800 dark:text-slate-200",
                            colClass(b.align[c] ?? null),
                          ].join(" ")}
                        >
                          {renderInline(tokenizeInline(row[c] ?? ""), `td-${idx}-${rIdx}-${c}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // paragraph
        const text = b.lines.join("\n");
        return (
          <div key={idx} className="mt-2 whitespace-pre-wrap break-words first:mt-0">
            {renderInline(tokenizeInline(text), `p-${idx}`)}
          </div>
        );
      })}
    </div>
  );
}

