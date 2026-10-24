# Local source gate (builds write ignored output). From the repository root:
#   powershell -File scripts/check-release.ps1
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-Check {
    param(
        [string] $Label,
        [string] $Executable,
        [string[]] $Arguments
    )
    Write-Host "==> $Label"
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE"
    }
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $projectRoot
try {
    Push-Location backend
    try {
        Invoke-Check 'Offline dependency lock' 'uv' @('lock', '--check', '--offline')
        Invoke-Check 'Backend lint' 'uv' @('run', '--offline', 'ruff', 'check', 'app', 'scripts/smoke_test.py')
        Invoke-Check 'Backend strict types' 'uv' @('run', '--offline', 'mypy', 'app')
        Invoke-Check 'Workspace scope' 'uv' @('run', '--offline', 'python', 'scripts/check_workspace_scoping.py')
        $contractCheck = "import json; from pathlib import Path; from app.main import app; saved=json.loads(Path('../packages/types/openapi.json').read_text(encoding='utf-8')); live=app.openapi(); assert live == saved, 'Saved OpenAPI is stale'; print('OpenAPI matches', len(live['paths']), 'paths')"
        Invoke-Check 'Saved OpenAPI parity' 'uv' @('run', '--offline', 'python', '-c', $contractCheck)
    }
    finally {
        Pop-Location
    }

    Invoke-Check 'Frontend lint, types and production builds' 'pnpm' @('exec', 'turbo', 'run', 'lint', 'typecheck', 'build')
    Invoke-Check 'Patch whitespace' 'git' @('diff', '--check')
    Write-Host 'Local release checks passed.'
}
finally {
    Pop-Location
}
