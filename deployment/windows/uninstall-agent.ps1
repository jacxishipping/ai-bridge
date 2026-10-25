# Remove the Windows agent and revoke it in the dashboard afterwards.
schtasks /delete /tn "AI Bridge Agent" /f
Remove-Item -Recurse -Force "$env:ProgramData\ai-bridge" -ErrorAction SilentlyContinue
Write-Host "Agent removed. Revoke the device in the AI Bridge dashboard so its token stops working."
