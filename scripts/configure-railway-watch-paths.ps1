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
$taskMutation = 'mutation($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) { serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input) }'
foreach ($taskService in $taskChanges) {
    $taskVariables = @{serviceId = $taskService.id; environmentId = $taskManifest.environmentId; input = @{watchPatterns = @($taskService.watchPatterns)}} | ConvertTo-Json -Depth 5 -Compress
    $taskResultJson = & railway api $taskMutation --variables $taskVariables --compact
    if ($LASTEXITCODE -ne 0) { throw 'Railway watch-path update failed; inspect environment before retrying.' }
    $taskResult = $taskResultJson | ConvertFrom-Json
    if (-not $taskResult.data.serviceInstanceUpdate) { throw 'Railway did not accept the watch-path update.' }
}
$taskAppliedJson = & railway environment config --environment $taskManifest.environment --json
if ($LASTEXITCODE -ne 0) { throw 'Could not verify Railway watch paths after update.' }
$taskApplied = $taskAppliedJson | ConvertFrom-Json
foreach ($taskService in $taskChanges) {
    $taskActual = ConvertTo-Json -InputObject @($taskApplied.services.($taskService.id).build.watchPatterns) -Compress
    $taskExpected = ConvertTo-Json -InputObject @($taskService.watchPatterns) -Compress
    if ($taskActual -ne $taskExpected) { throw "Railway watch paths did not persist for $($taskService.id)." }
}
Write-Output 'Verified all requested Railway watch paths.'
