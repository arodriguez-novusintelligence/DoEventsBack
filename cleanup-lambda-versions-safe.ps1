<#
Safe Lambda versions cleanup script
- Keeps the latest N versions (default 2)
- Preserves any versions referenced by aliases
- Supports dry-run to show what would be deleted
- Requires AWS CLI configured with permissions: lambda:ListVersionsByFunction, lambda:ListAliases, lambda:DeleteFunction
Usage examples:
.
# Dry run for named functions, keep 2:
PowerShell\> .\cleanup-lambda-versions-safe.ps1 -Functions @("my-func-dev","other-func-dev") -Keep 2 -DryRun

# Dry run for all functions matching prefix (use -Prefix)
PowerShell\> .\cleanup-lambda-versions-safe.ps1 -Prefix "notifications-dev-" -Keep 2 -DryRun

# Actual deletion (careful):
PowerShell\> .\cleanup-lambda-versions-safe.ps1 -Prefix "notifications-dev-" -Keep 2
#>

param(
    [string[]]$Functions = @(),
    [string]$Prefix = "",
    [int]$Keep = 2,
    [string]$Region = "us-east-1",
    [switch]$DryRun
)

function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# Helper to run AWS CLI and return array of tokens
function RunAws($args) {
    $output = aws @args --region $Region 2>$null
    if (!$output) { return @() }
    # split by whitespace (tabs or spaces)
    $tokens = $output -split '\s+' | Where-Object { $_ -ne '' }
    return ,$tokens
}

# If prefix provided, list all functions and filter
if ($Prefix -and ($Functions.Count -eq 0)) {
    Write-Info "Listing functions by prefix '$Prefix'..."
    $all = aws lambda list-functions --region $Region --query 'Functions[].FunctionName' --output text 2>$null
    if ($all) { $allList = $all -split '\s+' } else { $allList = @() }
    $Functions = $allList | Where-Object { $_ -like "$Prefix*" }
}

if ($Functions.Count -eq 0) {
    Write-Warn "No functions specified or found. Provide -Functions or -Prefix. Exiting."
    exit 0
}

Write-Info "Functions to process: $($Functions -join ', ')"

foreach ($functionName in $Functions) {
    Write-Info "Processing function: $functionName"

    # Get all versions except $LATEST
    $versionsRaw = aws lambda list-versions-by-function --function-name $functionName --region $Region --query 'Versions[?Version!=`$LATEST`].Version' --output text 2>$null
    if (-not $versionsRaw) {
        Write-Info "  No published versions found for $functionName"
        continue
    }
    $versions = $versionsRaw -split '\s+' | Where-Object { $_ -ne '' }

    # Get aliases and find referenced versions
    $aliasesRaw = aws lambda list-aliases --function-name $functionName --region $Region --query 'Aliases[].FunctionVersion' --output text 2>$null
    $aliasVersions = @()
    if ($aliasesRaw) { $aliasVersions = $aliasesRaw -split '\s+' | Where-Object { $_ -ne '' } }

    if ($aliasVersions.Count -gt 0) {
        Write-Info "  Aliases point to versions: $($aliasVersions -join ', ')"
    }

    # Sort numeric versions descending to find latest ones
    $numericVersions = $versions | Where-Object { $_ -match '^\d+$' } | Sort-Object {[int]$_} -Descending

    $toKeep = @()
    if ($numericVersions.Count -gt 0) {
        $toKeep = $numericVersions | Select-Object -First $Keep
    }

    # Always keep versions referenced by aliases
    $toKeep = $toKeep + $aliasVersions
    $toKeep = $toKeep | Select-Object -Unique

    # Compute deletable versions
    $deletable = $versions | Where-Object { $toKeep -notcontains $_ }

    if ($deletable.Count -eq 0) {
        Write-Info "  Nothing to delete for $functionName (keeping $Keep + aliases)"
        continue
    }

    Write-Info "  Versions to keep: $($toKeep -join ', ')"
    Write-Info "  Candidate versions to delete: $($deletable -join ', ')"

    foreach ($v in $deletable) {
        if ($DryRun) {
            Write-Host "  [DryRun] Would delete version $v from $functionName"
        } else {
            Write-Info "  Deleting version $v from $functionName"
            try {
                aws lambda delete-function --function-name $functionName --qualifier $v --region $Region 2>$null
                if ($LASTEXITCODE -ne 0) {
                    Write-Warn "    aws cli returned non-zero for deleting version $v"
                } else {
                    Write-Info "    Deleted version $v"
                }
            } catch {
                $msg = $_.Exception.Message
                Write-Err ("    Error deleting version {0}: {1}" -f $v, $msg)
            }
            Start-Sleep -Milliseconds 500
        }
    }
}

Write-Info "Done. Consider running 'aws lambda get-account-settings --region $Region --query AccountUsage' to review usage."