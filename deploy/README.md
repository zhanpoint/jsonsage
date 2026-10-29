# Deployment

GitHub Actions tests the source and builds the release image on its runner.
The image is tagged and labelled with the commit SHA, then transferred as a
compressed Docker archive through a workflow artifact and SSH standard input.
Production only loads the image, checks its revision, starts the container and
verifies its health and version. It must not install dependencies or compile.

`deploy <commit-sha>` requires the compressed image archive on standard input.
Run the workflow to release; invoking the command without an archive fails
without replacing the running container. The restricted SSH entrypoint fetches
the requested main revision and skips superseded releases. Activation failures
restore the previous image.

The Compose memory limit applies to the running application only. Docker builds
are separate workloads and must remain on CI runners, especially when the host
also runs other applications. Swap is not a substitute for this separation.

Validate deployment failure handling with `bash tests/deploy.test.sh`.
