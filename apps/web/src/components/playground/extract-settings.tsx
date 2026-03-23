'use client';

import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, LayoutTemplate } from 'lucide-react';
import { cn } from '@/lib/utils';
import { extractTemplates } from './extract-templates';

export interface ExtractConfig {
  enabled: boolean;
  schema: string;
  prompt: string;
}

interface ExtractSettingsProps {
  config: ExtractConfig;
  onChange: (config: ExtractConfig) => void;
  compact?: boolean;
}

export function ExtractSettings({ config, onChange, compact = false }: ExtractSettingsProps) {
  const [expanded, setExpanded] = useState(config.enabled);
  const [selectedTemplate, setSelectedTemplate] = useState('custom');

  const toggle = () => {
    const newEnabled = !config.enabled;
    onChange({ ...config, enabled: newEnabled });
    if (newEnabled) setExpanded(true);
  };

  const applyTemplate = (templateId: string) => {
    setSelectedTemplate(templateId);
    if (templateId === 'custom') return;

    const template = extractTemplates.find((t) => t.id === templateId);
    if (template) {
      onChange({
        ...config,
        enabled: true,
        prompt: template.prompt,
        schema: template.schema,
      });
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={() => {
          if (config.enabled) {
            setExpanded(!expanded);
          } else {
            toggle();
          }
        }}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <Sparkles className={cn('h-3 w-3', config.enabled && 'text-primary')} />
        AI Extraction
        {config.enabled ? (
          expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <span className="text-[10px] text-muted-foreground/60 ml-1">(click to enable)</span>
        )}
      </button>

      {config.enabled && expanded && (
        <div className="border border-border rounded-lg p-3 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={toggle}
                className="rounded border-border"
              />
              Enable extraction
            </label>

            {/* Template selector */}
            <div className="flex items-center gap-1.5">
              <LayoutTemplate className="h-3 w-3 text-muted-foreground" />
              <select
                value={selectedTemplate}
                onChange={(e) => applyTemplate(e.target.value)}
                className="h-7 rounded-md border border-input bg-transparent px-2 text-[11px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="custom">Custom</option>
                {extractTemplates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Template description */}
          {selectedTemplate !== 'custom' && (
            <p className="text-[10px] text-muted-foreground bg-primary/5 rounded px-2 py-1">
              {extractTemplates.find((t) => t.id === selectedTemplate)?.description}
            </p>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Prompt <span className="text-muted-foreground/60">(natural language instruction)</span>
            </label>
            <textarea
              value={config.prompt}
              onChange={(e) => {
                onChange({ ...config, prompt: e.target.value });
                setSelectedTemplate('custom');
              }}
              placeholder="e.g. Extract the product name, price, and description from this page"
              className={cn(
                'flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y',
                compact ? 'min-h-16' : 'min-h-20',
              )}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              JSON Schema <span className="text-muted-foreground/60">(optional, for structured output)</span>
            </label>
            <textarea
              value={config.schema}
              onChange={(e) => {
                onChange({ ...config, schema: e.target.value });
                setSelectedTemplate('custom');
              }}
              placeholder={`{
  "type": "object",
  "properties": {
    "title": { "type": "string" },
    "price": { "type": "number" }
  }
}`}
              className={cn(
                'flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y',
                compact ? 'min-h-20' : 'min-h-28',
              )}
            />
            {config.schema && (() => {
              try { JSON.parse(config.schema); return null; } catch {
                return <p className="text-[10px] text-destructive mt-1">Invalid JSON schema</p>;
              }
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export const defaultExtractConfig: ExtractConfig = {
  enabled: false,
  schema: '',
  prompt: '',
};
