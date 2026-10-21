import React from "react";
import { Modal } from "./modal.js";
import "./issue-dialog.css";

export function IssueDialog({ close, children }: { close: () => void; children: React.ReactNode }) {
  return <Modal className="issue-dialog" titleID="issue-dialog-title" title="View & resolve" close={close} bodyClassName="issue-dialog-body">{children}</Modal>;
}
