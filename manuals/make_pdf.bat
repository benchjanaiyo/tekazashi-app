@echo off
cd /d "%~dp0"
"C:\Users\bench\AppData\Local\Programs\Python\Python311\python.exe" -c "from docx2pdf import convert; convert('tekazashi_guide.docx', 'tekazashi_guide.pdf'); print('Done: PDF generated')"
copy /Y tekazashi_guide.pdf ..\guide\tekazashi_guide.pdf > nul
echo Done: guide\tekazashi_guide.pdf updated
echo.
pause
