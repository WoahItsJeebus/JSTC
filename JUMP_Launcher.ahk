#Requires AutoHotkey v2.0.19
#SingleInstance Force

; -------------------------------
; Robust GitHub-updating Launcher
; - Primary download method: /releases/latest/download/<Project>.ahk  (your method)
; - Uses GitHub API only to read tag_name (version), with strong fallbacks
; - Handles: 404 (no release), 403 (rate limit), network errors
; - Optional fallback to raw GitHub (main/master) if release asset is missing
; - Adds a cooldown to reduce API calls and rate-limits
; - First-run safe: cache stored in %TEMP% until project dir exists
; -------------------------------

global OwnerName   := "WoahItsJeebus"
global ProjectName := "JUMP"                  ; repo name + local folder name
global AssetName   := ProjectName ".ahk"      ; expected release asset name
global CheckCooldownSec := 300                ; don't hit GitHub more often than this (5 min)
global EnableRawFallback := true              ; if release download 404s, try raw main/master

; Local paths
A_LocalAppData := EnvGet("LOCALAPPDATA")
projDir         := A_LocalAppData "\" ProjectName
localScriptPath := projDir "\" ProjectName ".ahk"

; Cache location: first-run safe
; If projDir doesn't exist yet, cache in %TEMP% so IniRead/IniWrite never trips on missing folder.
cacheIni := (DirExist(projDir) ? (projDir "\launcher_cache.ini") : (A_Temp "\launcher_cache_" ProjectName ".ini"))

; -------------------------------
; Read local version (if any)
; -------------------------------
localVersion := ""
if FileExist(localScriptPath) {
    try {
        scriptContent := FileRead(localScriptPath, "UTF-8")
        localVersion := ExtractLocalVersion(scriptContent) ; normalized "X.Y.Z" or "0.0.0"
    } catch {
        localVersion := "0.0.0"
    }
}

; -------------------------------
; Cooldown check (avoid rate limit)
; -------------------------------
nowUnix := DateDiff(A_NowUTC, "19700101000000", "Seconds")

lastCheck    := IniReadSafe(cacheIni, "Cache", "LastCheckUnix", 0)
lastKnownTag := IniReadSafe(cacheIni, "Cache", "LastKnownTag", "")

doNetCheck := true
if (lastCheck && (nowUnix - lastCheck) < CheckCooldownSec)
    doNetCheck := false

latestTag := ""
apiStatus := 0
apiErrMsg := ""

if doNetCheck {
    try {
        latestTag := GetLatestReleaseTag(OwnerName, ProjectName, &apiStatus)
        latestTag := NormalizeVersion(latestTag)

        IniWriteSafe(nowUnix, cacheIni, "Cache", "LastCheckUnix")
        IniWriteSafe(latestTag, cacheIni, "Cache", "LastKnownTag")
    } catch as e {
        apiErrMsg := e.Message
        ; still record last check time so you don't spam on repeated failures
        IniWriteSafe(nowUnix, cacheIni, "Cache", "LastCheckUnix")
    }
} else {
    latestTag := NormalizeVersion(lastKnownTag)
}

; -------------------------------
; Decide whether to update
; -------------------------------
needUpdate := false

if (latestTag != "" && latestTag != "0.0.0") {
    if (localVersion = "")
        needUpdate := true
    else
        needUpdate := IsVersionNewer(localVersion, latestTag)
} else {
    ; Couldn't get latest tag (offline/rate-limit/no release):
    ; If local exists, run it. If local missing, bootstrap via download anyway.
    if !FileExist(localScriptPath)
        needUpdate := true
}

; -------------------------------
; Download/update if needed
; -------------------------------
if needUpdate {
    if !DirExist(projDir)
        DirCreate(projDir)

    ; Once projDir exists, prefer cache inside it going forward
    cacheIni := projDir "\launcher_cache.ini"

    tempFilePath := A_Temp "\temp_" ProjectName "_" A_TickCount ".ahk"

    ; Your method: release asset URL
    releaseURL := "https://github.com/" OwnerName "/" ProjectName "/releases/latest/download/" AssetName
    ok := TryDownloadScript(releaseURL, tempFilePath)

    ; If release asset missing (404 => usually HTML page), optionally try raw fallback
    if !ok && EnableRawFallback {
        rawURL1 := "https://raw.githubusercontent.com/" OwnerName "/" ProjectName "/main/" AssetName
        rawURL2 := "https://raw.githubusercontent.com/" OwnerName "/" ProjectName "/master/" AssetName

        ok := TryDownloadScript(rawURL1, tempFilePath)
        if !ok
            ok := TryDownloadScript(rawURL2, tempFilePath)
    }

    if ok {
        try {
            SafeReplaceFile(tempFilePath, localScriptPath)
        } catch as e {
            try if FileExist(tempFilePath)
                FileDelete(tempFilePath)

            if FileExist(localScriptPath) {
                Run(localScriptPath)
                ExitApp()
            }

            MsgBox "Downloaded update but failed to install it.`n`n" e.Message
            ExitApp()
        }
    } else {
        try if FileExist(tempFilePath)
            FileDelete(tempFilePath)

        if FileExist(localScriptPath) {
            Run(localScriptPath)
            ExitApp()
        }

        msg := "Failed to download the script."
        if (apiErrMsg != "")
            msg .= "`n`nGitHub API note: " apiErrMsg
        MsgBox msg
        ExitApp()
    }
}

; -------------------------------
; Launch local
; -------------------------------
if FileExist(localScriptPath) {
    Run(localScriptPath)
    ExitApp()
}

MsgBox "No local copy exists, and no download succeeded."
ExitApp()

; =========================================================
; Helpers
; =========================================================

IniReadSafe(file, section, key, default := "") {
    try {
        return IniRead(file, section, key, default)
    } catch {
        return default
    }
}

IniWriteSafe(value, file, section, key) {
    ; Ensure parent dir exists if file is inside a folder path
    SplitPath(file, , &dir)
    if (dir != "" && !DirExist(dir))
        DirCreate(dir)

    try IniWrite(value, file, section, key)
}

ExtractLocalVersion(scriptContent) {
    if RegExMatch(scriptContent, 'im)^\s*version\s*:=\s*"([^"]+)"', &m)
        return NormalizeVersion(m[1])
    return "0.0.0"
}

NormalizeVersion(ver) {
    ver := Trim(ver)
    if (ver = "")
        return "0.0.0"
    if RegExMatch(ver, "i)(\d+(?:\.\d+)+)", &m)
        return m[1]
    return "0.0.0"
}

IsVersionNewer(localVer, latestVer) {
    localVer  := NormalizeVersion(localVer)
    latestVer := NormalizeVersion(latestVer)

    localParts  := StrSplit(localVer, ".")
    latestParts := StrSplit(latestVer, ".")

    maxLen := (localParts.Length > latestParts.Length) ? localParts.Length : latestParts.Length
    Loop maxLen {
        i := A_Index
        a := (i <= localParts.Length)  ? (localParts[i] + 0) : 0
        b := (i <= latestParts.Length) ? (latestParts[i] + 0) : 0
        if (b > a)
            return true
        else if (b < a)
            return false
    }
    return false
}

GetLatestReleaseTag(owner, repo, &statusOut := 0) {
    url := "https://api.github.com/repos/" owner "/" repo "/releases/latest"
    req := ComObject("WinHttp.WinHttpRequest.5.1")

    req.Open("GET", url, false)
    req.SetRequestHeader("User-Agent", "AHK-Launcher/1.0")
    req.SetRequestHeader("Accept", "application/vnd.github+json")

    try req.Send()
    catch as err
        throw Error("GitHub API request failed (network?).`n`n" err.Message, -1)

    statusOut := req.Status
    text := req.ResponseText
    headers := req.GetAllResponseHeaders()

    if (statusOut = 404)
        throw Error("GitHub API: no published releases found (404).", -1)

    if (statusOut = 403) {
        if RegExMatch(headers, "i)x-ratelimit-remaining:\s*0")
            throw Error("GitHub API rate limited (403). Try again later or increase cooldown.", -1)
        throw Error("GitHub API returned 403 (forbidden / possibly rate limited).", -1)
    }

    if (statusOut != 200)
        throw Error("GitHub API returned " statusOut ".`n`n" text, -1)

    res := JSON_parse(text)

    try return res.tag_name
    catch
        throw Error("GitHub API response missing tag_name.", -1)
}

TryDownloadScript(url, outTempPath) {
    try Download(url, outTempPath)
    catch
        return false

    if !FileExist(outTempPath)
        return false

    if (FileGetSize(outTempPath) < 32) {
        try FileDelete(outTempPath)
        return false
    }

    try txt := FileRead(outTempPath, "UTF-8")
    catch {
        try FileDelete(outTempPath)
        return false
    }

    if IsProbablyHtml(txt) {
        try FileDelete(outTempPath)
        return false
    }

    if !HasAhkMarker(txt) {
        try FileDelete(outTempPath)
        return false
    }

    return true
}

SafeReplaceFile(newPath, destPath) {
    backup := destPath ".bak"

    try if FileExist(backup)
        FileDelete(backup)

    if FileExist(destPath) {
        try FileMove(destPath, backup, true)
        catch as err
            throw Error("Target script appears in-use/locked. Close it and retry.`n`n" err.Message, -1)
    }

    try FileMove(newPath, destPath, true)
    catch as err {
        try if FileExist(backup)
            FileMove(backup, destPath, true)
        throw Error("Failed to install update.`n`n" err.Message, -1)
    }

    try if FileExist(backup)
        FileDelete(backup)
}

HasAhkMarker(text) {
    if RegExMatch(text, "im)^\s*#Requires\s+AutoHotkey\s+v2")
        return true
    if RegExMatch(text, "im)^\s*#SingleInstance\b")
        return true
    if RegExMatch(text, "im)^\s*(global\s+|class\s+|;|#)")
        return true
    return false
}

IsProbablyHtml(text) {
    head := SubStr(LTrim(text), 1, 240)
    return RegExMatch(head, "i)^(<!doctype\s+html|<html|<head|<meta|<title)")
}

JSON_parse(str) {
    htmlfile := ComObject("htmlfile")
    htmlfile.write('<meta http-equiv="X-UA-Compatible" content="IE=edge">')
    return htmlfile.parentWindow.JSON.parse(str)
}
