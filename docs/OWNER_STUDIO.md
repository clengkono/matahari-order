# Everyday Matahari Studio

This is the short owner guide for adding product photos and publishing them.

## Normal daily image work

1. Double-click **Start Matahari Studio**
2. Add or replace images in the Queue
3. When finished, close Studio (press `Ctrl+C` in the Studio window)
4. Double-click **Publish Matahari Changes**
5. Review the summary
6. Press **Y** to publish to GitHub

You do not need to remember `npm`, `git`, or catalogue commands for this daily work.

## One-time desktop shortcuts

Double-click **Create Matahari Desktop Shortcuts** once.

That puts **Matahari Studio** and **Publish Matahari Changes** on your Desktop.

If you prefer to create a shortcut yourself:

1. Right-click `Start Matahari Studio.cmd` in the project folder
2. Send to → Desktop (create shortcut)
3. Repeat for `Publish Matahari Changes.cmd`

## Recovery

### Studio is already running

If you start Studio again, it should say it is already running and open the Studio page. It should not start a second copy. Use the original window and press `Ctrl+C` there to stop.

### Publish says code files changed

Publish stopped to protect you. Everyday publish only sends product images and catalogue data.

Leave the extra files alone, or ask a developer to handle code changes separately. Do not mix unfinished Cursor work with a photo batch.

### Validation failed

Nothing was published. The message names the check that failed. Fix that problem (or ask a developer), then run Publish again.

### Push failed

Your work is still saved on this computer. GitHub did not receive it yet.

Sign in to GitHub if asked, then run **Publish Matahari Changes** again. It will try to send the local commit.

### No Matahari changes to publish

There is nothing new to send. That is normal if you did not add images since the last publish.
