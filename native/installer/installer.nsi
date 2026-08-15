; DeepSeek Harness native client installer (NSIS).
; Built from CI: makensis installer\installer.nsi

Unicode true
!include "MUI2.nsh"

Name "DeepSeek Harness"
OutFile "..\target\release\dsh-client-setup.exe"
InstallDir "$LOCALAPPDATA\DeepSeekHarness"
InstallDirRegKey HKCU "Software\DeepSeekHarness" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma

!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

Section "DeepSeek Harness" SecMain
  SetOutPath "$INSTDIR"
  File "..\target\release\dsh-client.exe"
  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKCU "Software\DeepSeekHarness" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeepSeekHarness" "DisplayName" "DeepSeek Harness"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeepSeekHarness" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeepSeekHarness" "DisplayVersion" "0.1.0"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeepSeekHarness" "Publisher" "jkesh"
  CreateDirectory "$SMPROGRAMS\DeepSeek Harness"
  CreateShortcut "$SMPROGRAMS\DeepSeek Harness\DeepSeek Harness.lnk" "$INSTDIR\dsh-client.exe"
  CreateShortcut "$DESKTOP\DeepSeek Harness.lnk" "$INSTDIR\dsh-client.exe"
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\dsh-client.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\DeepSeek Harness\DeepSeek Harness.lnk"
  RMDir "$SMPROGRAMS\DeepSeek Harness"
  Delete "$DESKTOP\DeepSeek Harness.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\DeepSeekHarness"
  DeleteRegKey HKCU "Software\DeepSeekHarness"
SectionEnd
