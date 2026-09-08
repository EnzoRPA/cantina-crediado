' Executa o script de keep-alive em segundo plano sem abrir janela do prompt
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "node scripts/keep-render-awake.mjs", 0, False
Set WshShell = Nothing
