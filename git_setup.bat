@echo off
echo ====================================================
echo  TraidiumX - GitHub Setup Helper
echo ====================================================
echo.

:: Initialize git repository if not exists
if not exist .git (
    echo [1/3] Initializing Git repository...
    git init
) else (
    echo [*] Git repository already initialized.
)

echo.
echo [2/3] Staging all files for commit...
git add .

echo.
echo [3/3] Creating initial commit...
git commit -m "Initial commit - TraidiumX Codebase"

echo.
echo ====================================================
echo  SUCCESS: Git commit created locally!
echo ====================================================
echo.
echo Now, follow these simple steps to push to your GitHub:
echo.
echo  1. Go to https://github.com and log in.
echo  2. Click "New" to create a new repository.
echo  3. Name it "traidiumx" and keep it PRIVATE.
echo  4. Do NOT check any options like "Add a README" or "Add .gitignore".
echo  5. Click "Create repository".
echo  6. Copy the repository URL (e.g. https://github.com/your-username/traidiumx.git).
echo  7. Run the following commands in your command prompt:
echo.
echo     git branch -M main
echo     git remote add origin YOUR_REPOSITORY_URL
echo     git push -u origin main
echo.
echo ====================================================
pause
