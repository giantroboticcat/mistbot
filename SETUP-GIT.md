# Setting Up GitHub Authentication

## Option 1: Using Git Credential Helper (Recommended)

The credential helper is already configured. When you push, Git will prompt for your credentials:

```bash
# When you push, enter:
# Username: your-github-username
# Password: your-github-token (NOT your GitHub password)
git push -u origin master
```

The credentials will be saved in `~/.git-credentials` for future use.

## Option 2: Update Remote URL with Token

If you prefer to include the token directly in the remote URL:

```bash
# Replace YOUR_TOKEN with your actual GitHub token
git remote set-url origin https://YOUR_TOKEN@github.com/giantroboticcat/mistbot.git
```

**Note:** This stores the token in plain text in `.git/config`, which is less secure.

## Option 3: Use SSH Instead (Most Secure)

1. Generate an SSH key (if you don't have one):
   ```bash
   ssh-keygen -t ed25519 -C "your_email@example.com"
   ```

2. Add the public key to GitHub:
   - Copy: `cat ~/.ssh/id_ed25519.pub`
   - Go to GitHub → Settings → SSH and GPG keys → New SSH key

3. Update remote to use SSH:
   ```bash
   git remote set-url origin git@github.com:giantroboticcat/mistbot.git
   ```

## Current Remote Configuration

Your current remote is:
```
origin  https://github.com/giantroboticcat/mistbot.git
```

## First Push

After setting up authentication, push your code:

```bash
git push -u origin master
```

Or if you're using `main` as your branch:
```bash
git branch -m main
git push -u origin main
```

