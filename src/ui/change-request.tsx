import React, { useState } from "react";
import { ActionButton } from "./action-button.js";

/** Local keystrokes; the owner retains drafts across paging and context updates. */
export function ChangeRequestForm({ initialText = "", disabled, reason, change, send, close }: {
  initialText?: string; disabled: boolean; reason?: string;
  change: (text: string) => void; send: (text: string) => Promise<boolean>; close: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);
  return <form className="change-request-form" aria-label="Request requirement changes" onSubmit={(event) => {
    event.preventDefault();
    if (disabled || saving || !text.trim()) return;
    setSaving(true);
    void send(text).then((saved) => { if (saved) close(); }).finally(() => setSaving(false));
  }}>
    <h4>Request changes</h4>
    <p>This asks for a revision, not approval or rejection of generated wording. Clear requests can update the specification automatically; ambiguous changes remain for your decision. This does not approve an AI assumption or start coding. Broader removals or feature changes need separate decisions.</p>
    <label>Requested changes<textarea rows={3} maxLength={12000} value={text} onChange={(event) => { setText(event.target.value); change(event.target.value); }} placeholder="Explain what should be different and the outcome you expect…" required /></label>
    <div className="button-row"><ActionButton className="primary" disabled={disabled || saving || !text.trim()} reason={disabled ? reason : saving ? "Your change request is being saved." : "Describe what should change first."}>{saving ? "Saving request…" : "Send change request"}</ActionButton><button type="button" className="quiet" disabled={saving} onClick={close}>Cancel change request</button></div>
  </form>;
}
