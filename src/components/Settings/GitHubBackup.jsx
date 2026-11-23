import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CloudUpload, History, ShieldCheck } from "lucide-react";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GitHubClient, GitHubError } from "@/api/github/client.js";
import {
  backupAccount,
  listBackupVersions,
  previewRestore,
  restoreAccount,
} from "@/services/githubBackup.js";
import {
  getBackupConfig,
  saveBackupConfig,
} from "@/services/githubBackupConfig.js";
import { exportOPML, getFeeds, importOPMLText, refreshAllFeeds } from "@/api/resources/feeds.js";
import { authState } from "@/stores/authStore.js";
import { reportError } from "@/lib/errors";
import { githubErrorKey } from "@/domain/github/errorKeys.js";
import { useStore } from "@nanostores/react";

const key = (name) => `settings.backup.github.${name}`;

const VERSIONS_PER_PAGE = 20;

export default function GitHubBackup() {
  const { t } = useTranslation();
  const account = useStore(authState);
  const accountId = account?.id;
  const [config, setConfig] = useState(() => getBackupConfig(account));
  const [busy, setBusy] = useState(null);
  const [versions, setVersions] = useState(null);
  const [versionsPage, setVersionsPage] = useState(1);
  const [versionsHasMore, setVersionsHasMore] = useState(false);
  const [preview, setPreview] = useState(null);
  const [canWrite, setCanWrite] = useState(null);
  // Bumped on every preview request and whenever the dialog closes, so a late
  // response cannot repopulate the preview after it was dismissed.
  const previewRequest = useRef(0);
  // Bumped on every versions request and whenever the dialog closes or the
  // account changes, so a late list response cannot reopen the dialog.
  const versionsRequest = useRef(0);

  useEffect(() => {
    setConfig(getBackupConfig(account));
    setVersions(null);
    setVersionsPage(1);
    setVersionsHasMore(false);
    previewRequest.current += 1;
    versionsRequest.current += 1;
    setPreview(null);
    setCanWrite(null);
    // The configuration is per account, so a new account reloads it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const update = (changes) => {
    const next = saveBackupConfig(account, changes);
    setConfig(next);
    // A different repository or token needs a new access check.
    if ("repo" in changes || "token" in changes) setCanWrite(null);
    return next;
  };

  const repoValid = useMemo(
    () => /^[\w.-]+\/[\w.-]+$/.test((config.repo || "").trim()),
    [config.repo],
  );
  const branchValid = (config.branch || "").trim().length > 0;

  const feedApi = {
    exportOPML,
    getFeeds,
    importOPMLText,
    refreshAllFeeds,
  };

  const run = async (busyKey, context, action) => {
    setBusy(busyKey);
    try {
      await action();
    } catch (error) {
      reportError(error, context);
      toast.error(t(key(githubErrorKey(error))));
    } finally {
      setBusy(null);
    }
  };

  const testAccess = () =>
    run("test", "backup.github.test", async () => {
      const client = new GitHubClient({ token: config.token });
      const result = await client.testAccess(config.repo);
      if (!result.ok) {
        throw result.error || new GitHubError(result.status || 0, "requestFailed");
      }
      if (result.permissions && !result.permissions.push) {
        setCanWrite(false);
        toast.error(t(key("noWriteAccess")));
        return;
      }
      setCanWrite(true);
      toast.success(t(key("testSuccess")));
    });

  const runBackup = () =>
    run("backup", "backup.github.backup", async () => {
      // The write permission is checked here as well, so a token that lost
      // its access fails with a clear message instead of a 403 later.
      const client = new GitHubClient({ token: config.token });
      const access = await client.testAccess(config.repo);
      if (!access.ok) {
        throw access.error || new GitHubError(access.status || 0, "requestFailed");
      }
      if (access.permissions && !access.permissions.push) {
        setCanWrite(false);
        toast.error(t(key("noWriteAccess")));
        return;
      }
      setCanWrite(true);

      const result = await backupAccount(account, { config, feeds: feedApi });
      if (result.skipped) {
        toast.success(t(key("unchanged")));
        return;
      }
      toast.success(t(key("backupSuccess"), { count: result.feedCount }));
      if (result.commitUrl) {
        window.open(result.commitUrl, "_blank", "noopener");
      }
    });

  const openVersions = () =>
    run("versions", "backup.github.versions", async () => {
      const request = ++versionsRequest.current;
      const commits = await listBackupVersions(account, {
        config,
        page: 1,
        perPage: VERSIONS_PER_PAGE,
      });
      if (request !== versionsRequest.current) return;
      setVersions(commits);
      setVersionsPage(1);
      setVersionsHasMore(commits.length === VERSIONS_PER_PAGE);
    });

  const loadMoreVersions = () =>
    run("versions", "backup.github.versions", async () => {
      const request = ++versionsRequest.current;
      const page = versionsPage + 1;
      const commits = await listBackupVersions(account, {
        config,
        page,
        perPage: VERSIONS_PER_PAGE,
      });
      // A late response must not reopen the dialog or extend a closed list.
      if (request !== versionsRequest.current) return;
      setVersions((current) => (current ? [...current, ...commits] : current));
      setVersionsPage(page);
      setVersionsHasMore(commits.length === VERSIONS_PER_PAGE);
    });

  const selectVersion = (sha) => {
    const request = ++previewRequest.current;
    return run("preview", "backup.github.preview", async () => {
      const result = await previewRestore(account, sha, {
        config,
        feeds: feedApi,
      });
      if (request === previewRequest.current) setPreview(result);
    });
  };

  const runRestore = () =>
    run("restore", "backup.github.restore", async () => {
      const result = await restoreAccount(account, preview.commitSha, {
        config,
        feeds: feedApi,
        opml: preview.opml,
        diff: preview.diff,
      });
      toast.success(
        t(key(result.imported ? "restoreSuccess" : "restoreNothing"), {
          count: result.diff.added.length,
        }),
      );
      setPreview(null);
      setVersions(null);
    });

  const disabled = !repoValid || !branchValid || !config.token || !!busy;
  // A token without write access cannot create a backup commit.
  const backupDisabled = disabled || canWrite === false;

  return (
    <>
      <section
        className="flex flex-col gap-4"
        aria-labelledby="backup-github-title"
      >
        <div className="flex flex-col gap-1.5">
          <h3 id="backup-github-title" className="text-sm font-semibold">
            {t(key("title"))}
          </h3>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t(key("description"))}
          </p>
        </div>

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="github-repo">{t(key("repo"))}</FieldLabel>
            <Input
              id="github-repo"
              value={config.repo}
              placeholder="owner/repository"
              disabled={Boolean(busy)}
              onChange={(event) => update({ repo: event.target.value })}
            />
            <FieldDescription>{t(key("repoHint"))}</FieldDescription>
          </Field>

          <div className="flex gap-3">
            <Field className="flex-1">
              <FieldLabel htmlFor="github-branch">{t(key("branch"))}</FieldLabel>
              <Input
                id="github-branch"
                value={config.branch}
                disabled={Boolean(busy)}
                onChange={(event) => update({ branch: event.target.value })}
              />
            </Field>
            <Field className="flex-1">
              <FieldLabel htmlFor="github-path">
                {t(key("pathPrefix"))}
              </FieldLabel>
              <Input
                id="github-path"
                value={config.pathPrefix}
                disabled={Boolean(busy)}
                onChange={(event) => update({ pathPrefix: event.target.value })}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="github-token">{t(key("token"))}</FieldLabel>
            <Input
              id="github-token"
              type="password"
              autoComplete="off"
              value={config.token}
              placeholder="github_pat_..."
              disabled={Boolean(busy)}
              onChange={(event) => update({ token: event.target.value })}
            />
            <FieldDescription>{t(key("tokenHint"))}</FieldDescription>
          </Field>

          <div className="flex items-center gap-2">
            <Checkbox
              id="github-remember"
              checked={config.rememberToken}
              disabled={Boolean(busy)}
              onCheckedChange={(checked) =>
                update({ rememberToken: checked === true })
              }
            />
            <FieldLabel htmlFor="github-remember" className="text-sm">
              {t(key("rememberToken"))}
            </FieldLabel>
          </div>
        </FieldGroup>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={testAccess}
            disabled={disabled}
            aria-busy={busy === "test"}
          >
            {busy === "test" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <ShieldCheck data-icon="inline-start" />
            )}
            {t(key("test"))}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={runBackup}
            disabled={backupDisabled}
            aria-busy={busy === "backup"}
          >
            {busy === "backup" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <CloudUpload data-icon="inline-start" />
            )}
            {t(key("backupNow"))}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={openVersions}
            disabled={disabled}
            aria-busy={busy === "versions"}
          >
            {busy === "versions" ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <History data-icon="inline-start" />
            )}
            {t(key("restore"))}
          </Button>
        </div>
      </section>

      <Dialog
        open={Boolean(versions)}
        onOpenChange={(open) => {
          if (!open) {
            setVersions(null);
            setVersionsPage(1);
            setVersionsHasMore(false);
            previewRequest.current += 1;
            versionsRequest.current += 1;
            setPreview(null);
          }
        }}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {preview ? t(key("previewTitle")) : t(key("versionsTitle"))}
            </DialogTitle>
          </DialogHeader>

          {preview ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {t(key("previewSummary"), {
                  added: preview.diff.added.length,
                  present: preview.diff.present.length,
                })}
              </p>
              <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto text-sm">
                {preview.diff.added.map((feed) => (
                  <li key={feed.url} className="truncate">
                    {feed.title || feed.url}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{t(key("noRemoval"))}</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {(versions || []).map((commit) => (
                <li key={commit.sha}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-accent"
                    disabled={Boolean(busy)}
                    onClick={() => selectVersion(commit.sha)}
                  >
                    <span className="block truncate">{commit.message}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDate(commit.date)}
                    </span>
                  </button>
                </li>
              ))}
              {versions?.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  {t(key("noVersions"))}
                </li>
              )}
              {versionsHasMore && (
                <li>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadMoreVersions}
                    disabled={Boolean(busy)}
                    aria-busy={busy === "versions"}
                  >
                    {busy === "versions" && (
                      <Spinner data-icon="inline-start" />
                    )}
                    {t(key("loadMore"))}
                  </Button>
                </li>
              )}
            </ul>
          )}

          <DialogFooter>
            {preview ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPreview(null)}
                >
                  {t(key("back"))}
                </Button>
                <Button
                  size="sm"
                  onClick={runRestore}
                  disabled={busy === "restore"}
                  aria-busy={busy === "restore"}
                >
                  {busy === "restore" && <Spinner data-icon="inline-start" />}
                  {t(key("confirmRestore"))}
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVersions(null)}
              >
                {t(key("close"))}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
