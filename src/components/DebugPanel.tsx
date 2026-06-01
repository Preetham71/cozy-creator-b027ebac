import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Bug, Loader2, ChevronDown, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { getDebugInfo, type DebugInfo } from "@/lib/debug.functions";
import type { Intent } from "@/lib/intent.functions";

type Props = {
  query: string;
  intent: Intent;
  /** Pre-computed debug info (e.g. for the rule-based results page). When provided, no server call is made. */
  precomputed?: DebugInfo;
  label?: string;
};

export function DebugPanel({ query, intent, precomputed, label = "Debug" }: Props) {
  const fetchDebug = useServerFn(getDebugInfo);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DebugInfo | null>(precomputed ?? null);
  const [loading, setLoading] = useState(false);

  const onOpenChange = async (v: boolean) => {
    setOpen(v);
    if (v && !data && !precomputed) {
      setLoading(true);
      try {
        const info = await fetchDebug({ data: { query, intent } });
        setData(info);
      } catch (e: any) {
        toast.error(e.message ?? "Failed to load debug info");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full border-dashed text-xs text-muted-foreground"
        >
          <Bug className="mr-1.5 h-3.5 w-3.5" />
          {label}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-display">Retrieval & prompt debug</SheetTitle>
          <SheetDescription>
            Admin-only. Inspect chunks, scores, and the prompt assembled for the LLM.
          </SheetDescription>
        </SheetHeader>

        {loading && (
          <div className="mt-8 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading debug info…
          </div>
        )}

        {data && (
          <div className="mt-6 space-y-6 pb-12">
            <Section title="Query">
              <p className="rounded-md bg-muted/40 p-3 text-sm">{data.query}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Generated {new Date(data.generatedAt).toLocaleString()}
              </p>
            </Section>

            <Divider />

            <Section title={`Retrieved chunks (${data.chunks.length})`}>
              {data.chunks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No chunks retrieved.</p>
              ) : (
                <div className="space-y-2">
                  {data.chunks.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-md border border-border bg-card p-3 text-xs"
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant="default" className="rounded-full">#{c.rank}</Badge>
                        <span className="font-mono text-[11px] text-muted-foreground">{c.id}</span>
                        <span className="text-[11px] text-muted-foreground">· {c.source}</span>
                      </div>
                      <p className="leading-relaxed text-foreground">{c.preview}</p>
                    </div>
                  ))}
                </div>
              )}
              <details className="mt-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Retrieval query</summary>
                <pre className="mt-2 overflow-x-auto rounded-md bg-muted/40 p-2 font-mono text-[11px]">
                  {data.retrievalSql}
                </pre>
              </details>
            </Section>

            <Divider />

            <Section title="Similarity scores & ranking">
              <details className="mb-2 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Scoring formula</summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-mono text-[11px] leading-relaxed">
                  {data.scoringFormula}
                </pre>
              </details>
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5">#</th>
                      <th className="px-2 py-1.5">ID</th>
                      <th className="px-2 py-1.5">Score</th>
                      <th className="px-2 py-1.5">Matches (field +weight)</th>
                      <th className="px-2 py-1.5">Img</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.chunks.map((c) => (
                      <tr key={c.id} className="border-t border-border align-top">
                        <td className="px-2 py-1.5 font-medium">{c.rank}</td>
                        <td className="px-2 py-1.5 font-mono text-[11px]">{c.id}</td>
                        <td className="px-2 py-1.5 font-semibold">{c.score}</td>
                        <td className="px-2 py-1.5">
                          {c.keywordHits.length ? (
                            <div className="flex flex-wrap gap-1">
                              {c.keywordHits.map((k, i) => (
                                <span key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{k}</span>
                              ))}
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-2 py-1.5">{c.imageRelevance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Base score = 1. Tie-break: lower price first.
              </p>
            </Section>

            <Divider />

            <Section title="Full LLM prompt">
              <Expandable text={data.finalPrompt} />
              <details className="mt-3 text-xs text-muted-foreground">
                <summary className="cursor-pointer select-none">Parsed intent</summary>
                <pre className="mt-2 overflow-x-auto rounded-md bg-muted/40 p-2 font-mono text-[11px]">
                  {JSON.stringify(data.intent, null, 2)}
                </pre>
              </details>
            </Section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Divider() {
  return <div className="border-t border-border" />;
}

function Expandable({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const truncated = text.length > 600;
  const onCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-border bg-muted/40">
        <pre className="max-h-64 overflow-auto p-3 font-mono text-[11px] leading-relaxed">
          {open || !truncated ? text : text.slice(0, 600) + "\n…"}
        </pre>
        <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
          {truncated ? (
            <CollapsibleTrigger asChild>
              <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                {open ? "Collapse" : "Show full prompt"}
              </button>
            </CollapsibleTrigger>
          ) : <span />}
          <button
            onClick={onCopy}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <CollapsibleContent />
      </div>
    </Collapsible>
  );
}
