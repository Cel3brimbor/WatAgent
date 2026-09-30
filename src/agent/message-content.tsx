"use client";

import { memo } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components, type Options } from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

type PluggableList = NonNullable<Options["remarkPlugins"]>;

const REMARK_PLUGINS: PluggableList = [remarkGfm];

const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter((tag) => tag !== "img" && tag !== "input"),
  protocols: { ...defaultSchema.protocols, href: ["http", "https", "mailto"] },
};

const REHYPE_PLUGINS: PluggableList = [[rehypeSanitize, SANITIZE_SCHEMA]];

function safeUrlTransform(url: string): string {
  const next = defaultUrlTransform(url);
  return /^(https?:|mailto:)/i.test(next) ? next : "";
}

const COMPONENTS: Components = {
  p: ({ children }) => <p className="md-p">{children}</p>,
  strong: ({ children }) => <strong className="md-strong">{children}</strong>,
  em: ({ children }) => <em className="md-em">{children}</em>,
  ul: ({ children }) => <ul className="md-list">{children}</ul>,
  ol: ({ children, start }) => (
    <ol className="md-list md-list-ol" start={typeof start === "number" ? start : undefined}>
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="md-li">{children}</li>,
  code: ({ children, className }) =>
    className ? (
      <code className="md-code-block">{children}</code>
    ) : (
      <code className="md-code">{children}</code>
    ),
  pre: ({ children }) => <pre className="md-pre">{children}</pre>,
  a: ({ href, children }) => {
    const safeHref = href && /^(https?:|mailto:)/i.test(href) ? href : undefined;
    return (
      <a href={safeHref} target="_blank" rel="noreferrer noopener" className="md-link">
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div className="md-table-wrap">
      <table className="md-table">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="md-th">{children}</th>,
  td: ({ children }) => <td className="md-td">{children}</td>,
};

function hideToolMarkup(content: string): string {
  return content
    .replace(/<tool_call[\s\S]*?<\/tool_call>/gi, "")
    .replace(/<tool_call[\s\S]*$/i, "")
    .trim();
}

export const MessageContent = memo(function MessageContent({
  content,
}: {
  content: string;
  pending?: boolean;
}) {
  const visible = hideToolMarkup(content);
  if (!visible) return null;
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      urlTransform={safeUrlTransform}
      components={COMPONENTS}
      skipHtml
    >
      {visible}
    </ReactMarkdown>
  );
});
