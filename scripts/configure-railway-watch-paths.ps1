param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskManifest = Get-Content -LiteralPath (Join-Path $taskRoot 'infra/railway/service-watch-paths.json') -Raw | ConvertFrom-Json
$taskConfigJson = & railway environment config --environment $taskManifest.environment --json
if ($LASTEXITCODE -ne 0) { throw 'Could not read the linked Railway environment.' }
$taskConfig = $taskConfigJson | ConvertFrom-Json
$taskChanges = @()
foreach ($taskEntry in $taskManifest.services.PSObject.Properties) {
    $taskService = $taskEntry.Value
    $taskExisting = $taskConfig.services.($taskService.id)
    if ($null -eq $taskExisting -or $taskExisting.source.repo -ne 'backline1212/app') {
        throw "Unexpected or missing source for $($taskEntry.Name); no configuration applied."
    }
    $taskExpected = ConvertTo-Json -InputObject @($taskService.watchPatterns) -Compress
    $taskCurrent = ConvertTo-Json -InputObject @($taskExisting.build.watchPatterns) -Compress
    [pscustomobject]@{ Service = $taskEntry.Name; Current = $taskCurrent; Expected = $taskExpected; Change = ($taskCurrent -ne $taskExpected) }
    if ($taskCurrent -ne $taskExpected) { $taskChanges += $taskService }
}
if (-not $Apply -or $taskChanges.Count -eq 0) { return }
$taskArguments = @('environment', 'edit', '--project', $taskManifest.projectId, '--environment', $taskManifest.environment)
foreach ($taskService in $taskChanges) {
    $taskArguments += @('--service-config', $taskService.id, 'build.watchPatterns', (ConvertTo-Json -InputObject @($taskService.watchPatterns) -Compress))
}
$taskArguments += @('--message', 'Track all backend and bundled asset build inputs')
& railway @taskArguments
if ($LASTEXITCODE -ne 0) { throw 'Railway watch-path update failed; inspect environment before retrying.' }
