# Projector placement simulator

A small, dependency-free browser tool for exploring projector placement, image shape and screen overlap. The default room uses a 4.6 m lens-to-wall distance, 1.5 m wide 16:9 screen, 0.6 m screen bottom and 2.5 m ceiling. Lens height (1.2 m), sideways position (0.6 m), and room width (5 m) are adjustable examples, not measurements.

## Run locally

From this directory, start a static server:

```sh
python -m http.server 8000
```

Open `http://localhost:8000`. Modern browsers are supported; no installation or build step is needed. The files can also be served as a static site, including with GitHub Pages. No deployment configuration is included.

Run the geometry tests with a recent Node.js version:

```sh
node --test geometry.test.mjs
```

## Put the project on GitHub

Create an empty GitHub repository, then run these commands from this directory
(replace `OWNER/REPOSITORY` with your repository path):

```sh
git init -b main
git add .
git commit -m "Add projector placement simulator"
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

For GitHub Pages, select **Deploy from a branch**, then `main` and `/ (root)` in
the repository's Pages settings. The app uses relative asset paths and needs no
build process. Publishing is optional; running locally needs no GitHub account.

## Using the simulator

Auto-fit to screen keeps the lens position and screen fixed while adjusting throw ratio, adjustable horizontal and vertical shift, and aim. Enter optional minimum and maximum throw ratios and lens-shift limits to constrain the search; without known manufacturer limits the result is a geometric fit, not confirmation that a projector can achieve it. When an exact fit is not found, the tool reports the best fit it found and its corner errors.

Set the optical throw ratio and native aspect ratio, the lens position, aim and shift, and the screen and room dimensions. Positive sideways position and yaw are to the right looking at the wall; positive pitch is up, and positive roll is clockwise. Shift values and fixed vertical offset are percentages of the full image dimension. The fixed offset is added to adjustable vertical shift.

Drag the 3D scene to orbit, use the wheel or pinch to zoom, and select front, top or side for orthographic views. Keyboard-accessible controls provide view selection and zoom. Focus the scene and use the arrow keys to orbit, plus or minus to zoom, and 0 to reset the camera. Save stores a setup locally in the browser; Copy link creates a shareable URL containing the setup. Copy projector specs provides a labelled summary of the current optical settings for shopping, with a selectable fallback if clipboard access is unavailable.

Optional digital keystone correction shows an ideal native-aspect rectangular prewarp inside the raw optical light footprint, together with panel area used, unused area and maximum horizontal and vertical corner displacement. Digital auto-fit targets the largest native-aspect rectangle within the screen. This is a generic model and does not establish a projector’s digital correction capabilities or resolution loss.

The model uses ideal ray geometry. It does not simulate focus, brightness, lens distortion, physical clearance or any specific manufacturer's optical design. The optional elliptical shift limit is an approximation and is not a validation of a manufacturer's shift range. Check projector documentation and verify measurements before installing. See `GEOMETRY.md` for coordinate and model details.
