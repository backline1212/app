param(
    [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$Commit,
    [switch]$Apply
)

# Read-only unless -Apply. Deploy the pushed Git commit, never this dirty checkout.
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskManifest = Get-Content -LiteralPath (Join-Path $taskRoot 'infra/railway/service-watch-paths.json') -Raw | ConvertFrom-Json
$taskPushed = & git -C $taskRoot ls-remote origin refs/heads/main
if ($LASTEXITCODE -ne 0 -or ($taskPushed -split '\s+')[0] -ne $Commit) {
    throw 'Commit must match the current pushed origin/main; nothing deployed.'
}
$taskConfigJson = & railway environment config --environment $taskManifest.environment --json
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect Railway sources.' }
$taskConfig = $taskConfigJson | ConvertFrom-Json
$taskTargets = @()
foreach ($taskEntry in $taskManifest.services.PSObject.Properties) {
    $taskSource = $taskConfig.services.($taskEntry.Value.id).source
    if ($taskSource.repo -ne 'backline1212/app' -or $taskSource.branch -ne 'main') {
        throw 'Unexpected Railway repository/branch; nothing deployed.'
    }
    $taskTargets += [pscustomobject]@{Service=$taskEntry.Name;ServiceId=$taskEntry.Value.id}
}
$taskMutation = 'mutation($commit: String!, $environment: String!, $service: String!) { serviceInstanceDeployV2(commitSha: $commit, environmentId: $environment, serviceId: $service) }'
foreach ($taskTarget in $taskTargets) {
    if (-not $Apply) {
        [pscustomobject]@{Service=$taskTarget.Service;Commit=$Commit;Mode='dry-run';DeploymentId=$null}
        continue
    }
    $taskVariables = @{commit=$Commit;environment=$taskManifest.environmentId;service=$taskTarget.ServiceId} | ConvertTo-Json -Compress
    $taskResultJson = & railway api $taskMutation --variables $taskVariables --compact --allow-errors
    if ($LASTEXITCODE -ne 0) { throw "Deploy dispatch failed for $($taskTarget.Service). Inspect prior dispatches before retrying." }
    $taskResult = $taskResultJson | ConvertFrom-Json
    if ($taskResult.errors) {
        if ($taskResult.errors.message -contains 'Deploys have been paused temporarily') {
            throw 'Railway deploys are temporarily paused. No deployment accepted for this service.'
        }
        throw 'Railway rejected the deploy request. Inspect deployment status before retrying.'
    }
    if (-not $taskResult.data.serviceInstanceDeployV2) { throw 'Railway did not return a deployment ID.' }
    [pscustomobject]@{Service=$taskTarget.Service;Commit=$Commit;Mode='dispatched';DeploymentId=$taskResult.data.serviceInstanceDeployV2}
}
