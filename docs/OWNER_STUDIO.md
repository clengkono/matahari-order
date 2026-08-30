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

## Default units and similar products

Studio also has **Defaults** and **Families** tabs.

- **Defaults** — confirm the usual order unit for each product. **Needs review** still shows the current automatic default. Press **Confirm** when that unit is correct, or pick another unit. **Use automatic default** undoes your confirmation.
- **Families** — group products that should appear as Produk Serupa. Create needs a name and at least two products. A product already in another family cannot be moved silently. Deleting a family does not delete the products.

When you are finished, publish with **Publish Matahari Changes** the same way as photos.

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

If Defaults or Families says the catalogue service is older, close **every** Matahari Studio window (`Ctrl+C` in each one), then start Studio again. Do not leave an old Studio window running.

If Studio says Vite crashed or **Matahari Studio did not start**, close any leftover Studio window (`Ctrl+C`), then Start Matahari Studio once. You do not need npm commands.

### Publish says code files changed

Publish stopped to protect you. Everyday publish only sends product images and catalogue data, including the generated customer catalogue when catalogue files changed.

Leave the extra files alone, or ask a developer to handle code changes separately. Do not mix unfinished Cursor work with a photo batch.

### Validation failed

Nothing was published. The message names the check that failed. Fix that problem (or ask a developer), then run Publish again.

### Push failed

Your work is still saved on this computer. GitHub did not receive it yet.

Sign in to GitHub if asked, then run **Publish Matahari Changes** again. It will try to send the local commit.

### No Matahari changes to publish

There is nothing new to send. That is normal if you did not add images since the last publish.
