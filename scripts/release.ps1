# Scripture Mate - one-command iOS release from Windows (no Mac required).
#
# This encodes the PROVEN end-to-end flow used for 1.2.0:
#   build (EAS cloud) -> upload to ASC -> wait for processing -> create/ensure
#   App Store version -> push metadata -> attach build -> validate -> submit for review.
#
# Usage:
#   .\scripts\release.ps1                 # full release of the version in app.json
#   .\scripts\release.ps1 -MetadataOnly   # only push store listing (no build/submit)
#   .\scripts\release.ps1 -NoSubmit       # build + stage everything but DON'T submit for review
#
# One-time prereqs (see DEPLOYMENT.md):
#   - npx eas-cli login   (Expo account)
#   - asc auth login --bypass-keychain --name ScriptureMate --key-id <KEY_ID> `
#       --issuer-id <ISSUER_ID> --private-key <path\AuthKey.p8>
#   - expo/credentials/AuthKey.p8 present (gitignored); eas.json submit profile filled
param(
    [switch]$MetadataOnly,
    [switch]$NoSubmit
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$expoDir  = Join-Path $repoRoot "expo"
$appId    = "6759493861"

# asc may not be on PATH in a fresh shell right after winget install
$asc = "asc"
if (-not (Get-Command asc -ErrorAction SilentlyContinue)) {
    $asc = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\asc.exe"
}
function Get-AscToken {
    return ((& $asc auth token --confirm) -join "") -replace '\s', ''
}

$appJson = Get-Content (Join-Path $expoDir "app.json") -Raw | ConvertFrom-Json
$version = $appJson.expo.version
$build   = $appJson.expo.ios.buildNumber
Write-Host "==> Releasing Scripture Mate v$version (iOS build $build)" -ForegroundColor Cyan

# ---- 1. Cloud build + upload the binary to App Store Connect ----
if (-not $MetadataOnly) {
    Write-Host "==> EAS build + submit (Expo cloud macOS workers)..." -ForegroundColor Cyan
    Push-Location $expoDir
    try {
        npx -y eas-cli@latest build --platform ios --profile production --auto-submit --non-interactive
        if ($LASTEXITCODE -ne 0) { throw "eas build/submit failed" }
    } finally { Pop-Location }
}

# ---- 2. Ensure the App Store version exists (copy prior metadata as a base) ----
$versionsJson = & $asc versions list --app $appId --output json | ConvertFrom-Json
$target = $versionsJson.data | Where-Object { $_.attributes.versionString -eq $version }
if (-not $target) {
    Write-Host "==> Creating App Store version $version..." -ForegroundColor Cyan
    $prior = ($versionsJson.data | Sort-Object { $_.attributes.createdDate } -Descending)[0].attributes.versionString
    & $asc versions create --app $appId --version $version --platform IOS `
        --copyright "$((Get-Date).Year) Scripture Mate" --release-type AFTER_APPROVAL --copy-metadata-from $prior | Out-Null
    $versionsJson = & $asc versions list --app $appId --output json | ConvertFrom-Json
    $target = $versionsJson.data | Where-Object { $_.attributes.versionString -eq $version }
}
$versionId = $target.id
Write-Host "    version id: $versionId"

# ---- 3. Push listing metadata (description, keywords, what's new, support URL) ----
Write-Host "==> Uploading localized metadata..." -ForegroundColor Cyan
& $asc localizations upload --version $versionId --path (Join-Path $repoRoot "store\localizations")

# ---- 4. App name + subtitle (read from store\app-info.txt) ----
$info = Get-Content (Join-Path $repoRoot "store\app-info.txt") -Raw
$name = ([regex]::Match($info, "(?m)^name\s*=\s*(.+)$")).Groups[1].Value.Trim()
$sub  = ([regex]::Match($info, "(?m)^subtitle\s*=\s*(.+)$")).Groups[1].Value.Trim()
if ($name) {
    Write-Host "==> Setting name='$name' subtitle='$sub'..." -ForegroundColor Cyan
    & $asc app-setup info set --app $appId --locale en-US --name $name --subtitle $sub | Out-Null
}

# ---- 4b. Upload App Store screenshots (real native captures; iPhone-only app) ----
# --replace clears each device set first so stale/inherited shots never linger.
$shotSets = @(
    @{ dir = "store\screenshots\iphone-67"; type = "IPHONE_67" },  # 1290x2796 (6.7"/6.9")
    @{ dir = "store\screenshots\iphone-65"; type = "IPHONE_65" }   # 1284x2778 (6.5")
)
$locJson = & $asc localizations list --version $versionId --output json --locale en-US | ConvertFrom-Json
$locId = $locJson.data[0].id
foreach ($set in $shotSets) {
    $shotsDir = Join-Path $repoRoot $set.dir
    if ((Test-Path $shotsDir) -and $locId) {
        Write-Host "==> Uploading $($set.type) screenshots..." -ForegroundColor Cyan
        & $asc screenshots upload --version-localization $locId --path $shotsDir --device-type $set.type --replace
    }
}

if ($MetadataOnly) { Write-Host "==> Metadata-only done." -ForegroundColor Green; return }

# ---- 5. Wait for the uploaded build to finish Apple processing, then attach it ----
Write-Host "==> Waiting for build $build to finish processing..." -ForegroundColor Cyan
$buildId = $null
for ($i = 0; $i -lt 30; $i++) {
    $token = Get-AscToken
    $h = @{ Authorization = "Bearer $token" }
    $builds = Invoke-RestMethod "https://api.appstoreconnect.apple.com/v1/builds?filter%5Bapp%5D=$appId&limit=15" -Headers $h
    $b = $builds.data | Where-Object { $_.attributes.version -eq $build } | Select-Object -First 1
    if ($b -and $b.attributes.processingState -eq "VALID") { $buildId = $b.id; break }
    if ($b -and $b.attributes.processingState -in @("INVALID", "FAILED")) { throw "Build $build processing $($b.attributes.processingState)" }
    Start-Sleep -Seconds 60
}
if (-not $buildId) { throw "Build $build did not become VALID in time" }
Write-Host "    build id: $buildId - attaching..." -ForegroundColor Cyan
& $asc versions attach-build --version-id $versionId --build $buildId | Out-Null

# ---- 6. Readiness check ----
Write-Host "==> Validating submission readiness..." -ForegroundColor Cyan
$val = & $asc validate --app $appId --version $version --platform IOS --output json | ConvertFrom-Json
if ($val.summary.blocking -gt 0) {
    Write-Host "==> BLOCKED - fix these before submitting:" -ForegroundColor Red
    $val.remediation.steps | Where-Object { $_.blocking } | ForEach-Object { "   - $($_.message): $($_.remediation)" }
    return
}
Write-Host "    readiness OK (0 blocking)." -ForegroundColor Green
if ($NoSubmit) { Write-Host "==> Staged but not submitted (-NoSubmit)." -ForegroundColor Yellow; return }

# ---- 7. Submit for review (App Store Connect reviewSubmissions API; asc has no submit-create) ----
Write-Host "==> Submitting $version for App Store review..." -ForegroundColor Cyan
$token = Get-AscToken
$h = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

# Reuse an existing non-final review submission if one exists (creating a 2nd 409s).
$existing = Invoke-RestMethod "https://api.appstoreconnect.apple.com/v1/reviewSubmissions?filter%5Bapp%5D=$appId&limit=20" -Headers $h
$open = $existing.data | Where-Object { $_.attributes.state -in @("READY_FOR_REVIEW", "UNRESOLVED_ISSUES") } | Select-Object -First 1
if ($open) {
    $subId = $open.id
    Write-Host "    reusing open review submission $subId ($($open.attributes.state))"
} else {
    $sub = Invoke-RestMethod -Method Post -Uri "https://api.appstoreconnect.apple.com/v1/reviewSubmissions" -Headers $h `
        -Body (@{ data = @{ type = "reviewSubmissions"; attributes = @{ platform = "IOS" }; relationships = @{ app = @{ data = @{ type = "apps"; id = $appId } } } } } | ConvertTo-Json -Depth 8)
    $subId = $sub.data.id
}

# Add this version as an item if it isn't already attached (retry the transient 409 seen
# when the attached build is still propagating).
$items = Invoke-RestMethod "https://api.appstoreconnect.apple.com/v1/reviewSubmissions/$subId/items" -Headers $h
$itemBody = @{ data = @{ type = "reviewSubmissionItems"; relationships = @{ reviewSubmission = @{ data = @{ type = "reviewSubmissions"; id = $subId } }; appStoreVersion = @{ data = @{ type = "appStoreVersions"; id = $versionId } } } } } | ConvertTo-Json -Depth 8
if ($items.data.Count -eq 0) {
    for ($try = 1; $try -le 5; $try++) {
        try {
            Invoke-RestMethod -Method Post -Uri "https://api.appstoreconnect.apple.com/v1/reviewSubmissionItems" -Headers $h -Body $itemBody | Out-Null
            break
        } catch {
            if ($try -eq 5) { throw }
            Write-Host "    item add failed (attempt $try), retrying in 20s..." -ForegroundColor Yellow
            Start-Sleep -Seconds 20
        }
    }
}
$done = Invoke-RestMethod -Method Patch -Uri "https://api.appstoreconnect.apple.com/v1/reviewSubmissions/$subId" -Headers $h `
    -Body (@{ data = @{ type = "reviewSubmissions"; id = $subId; attributes = @{ submitted = $true } } } | ConvertTo-Json -Depth 8)

Write-Host ""
Write-Host "==> SUBMITTED. Review state: $($done.data.attributes.state)" -ForegroundColor Green
Write-Host "    Monitor: asc status --app $appId   (or asc review status --app $appId)"
