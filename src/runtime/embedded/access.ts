import { spawn } from "node:child_process";

/** SDK 2.1.4 stores OAuth values in SQLite JSON, not DPAPI. Restrict its entire root. */
export async function protectAuthDirectory(directory: string, initialize: boolean): Promise<void> {
  if (process.platform !== "win32") throw new Error("The helper authentication pilot requires Windows owner-only credential storage.");
  const command = `
$ErrorActionPreference='Stop'
$phase='initialization'
trap {[Console]::Out.Write('blocked:'+$phase); exit 1}
$inputData=[Console]::In.ReadToEnd() | ConvertFrom-Json
$root=[IO.Path]::GetFullPath($inputData.directory)
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$system=[Security.Principal.SecurityIdentifier]::new('S-1-5-18')
if($inputData.initialize){
  $phase='acl-construction'
  $acl=[Security.AccessControl.DirectorySecurity]::new()
  $acl.SetOwner($sid)
  $acl.SetAccessRuleProtection($true,$false)
  foreach($who in @($sid,$system)){
    $rule=[Security.AccessControl.FileSystemAccessRule]::new($who,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $acl.AddAccessRule($rule)
  }
  $phase='acl-application'
  [IO.DirectoryInfo]::new($root).SetAccessControl($acl)
}
$phase='acl-verification'
$pending=[Collections.Generic.Queue[string]]::new()
$pending.Enqueue($root)
$count=0
while($pending.Count -gt 0){
  $path=$pending.Dequeue()
  $isDirectory=[IO.Directory]::Exists($path)
  $item=if($isDirectory){[IO.DirectoryInfo]::new($path)}else{[IO.FileInfo]::new($path)}
  if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'reparse point'}
  $acl=$item.GetAccessControl()
  if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw 'owner'}
  if($path -eq $root -and -not $acl.AreAccessRulesProtected){throw 'inherited root'}
  foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
    if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -ne $sid.Value -and $rule.IdentityReference.Value -ne $system.Value){throw 'other principal'}
  }
  if($isDirectory){foreach($child in [IO.Directory]::EnumerateFileSystemEntries($path)){$pending.Enqueue($child)}}
  $count++
  if($count -gt 10000){throw 'directory bound'}
}
[Console]::Out.Write('protected')
`;
  await new Promise<void>((accept, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const fail = () => {
      const phase = /^blocked:(initialization|acl-construction|acl-application|acl-verification)$/.exec(output)?.[1] ?? "unconfirmed";
      reject(new Error(`Cannot verify owner-only SDK credential storage (${phase}). Existing data was retained; authentication remains blocked.`));
    };
    const timer = setTimeout(() => { child.kill(); fail(); }, 15_000);
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => { output = (output + chunk.toString()).slice(-32); }); child.stderr.resume();
    child.stdin.on("error", () => {});
    child.once("error", () => { clearTimeout(timer); fail(); });
    child.once("close", code => { clearTimeout(timer); if (code === 0 && output === "protected") accept(); else fail(); });
    child.stdin.end(JSON.stringify({ directory, initialize }));
  });
}
