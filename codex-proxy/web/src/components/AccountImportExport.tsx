import { useState, useCallback, useRef } from "preact/hooks";
import { useT } from "../../../shared/i18n/context";

interface ImportResult {
  success: boolean;
  added: number;
  updated: number;
  failed: number;
  errors: string[];
}

interface AccountImportExportProps {
  onExport: (selectedIds?: string[]) => Promise<void>;
  onImport: (file: File) => Promise<ImportResult>;
  selectedIds: Set<string>;
}

export function AccountImportExport({ onExport, onImport, selectedIds }: AccountImportExportProps) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    try {
      const ids = selectedIds.size > 0 ? [...selectedIds] : undefined;
      await onExport(ids);
    } catch (err) {
      console.error("[AccountExport] failed:", err);
    }
  }, [onExport, selectedIds]);

  const handleFileChange = useCallback(async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;

    setImporting(true);
    setResult(null);
    try {
      let totalAdded = 0, totalUpdated = 0, totalFailed = 0;
      for (const file of files) {
        const res = await onImport(file);
        totalAdded += res.added;
        totalUpdated += res.updated;
        totalFailed += res.failed;
      }
      const msg = t("accountImportResult")
        .replace("{added}", String(totalAdded))
        .replace("{updated}", String(totalUpdated))
        .replace("{failed}", String(totalFailed));
      setResult(msg);
    } catch {
      setResult(t("accountImportError"));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [onImport, t]);

  const triggerFileSelect = useCallback(() => {
    fileRef.current?.click();
  }, []);

  const exportTitle = selectedIds.size > 0
    ? `${t("exportBtn")} (${selectedIds.size})`
    : t("exportBtn");

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        multiple
        onChange={handleFileChange}
        class="hidden"
      />
      <button
        onClick={triggerFileSelect}
        disabled={importing}
        title={t("importBtn")}
        class="p-1.5 text-slate-400 dark:text-text-dim hover:text-primary transition-colors rounded-md hover:bg-primary/10 disabled:opacity-40"
      >
        <svg class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
        </svg>
      </button>
      <button
        onClick={handleExport}
        title={exportTitle}
        class="p-1.5 text-slate-400 dark:text-text-dim hover:text-primary transition-colors rounded-md hover:bg-primary/10"
      >
        <svg class="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12M12 16.5V3" />
        </svg>
      </button>
      {selectedIds.size > 0 && (
        <span class="text-[0.7rem] text-primary font-medium hidden sm:inline">
          {selectedIds.size}
        </span>
      )}
      {result && (
        <span class="text-[0.75rem] text-slate-500 dark:text-text-dim hidden sm:inline">
          {result}
        </span>
      )}
    </>
  );
}
