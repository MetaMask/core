# The name is overwritten, causing the package to get published under a
# different NPM scope than non-preview builds.
.name |= sub("@metamask/"; "\($npm_scope)/") |

# The prerelease version is overwritten, preserving the non-prerelease portion
# of the version. Technically we'd want to bump the non-prerelease portion as
# well if we wanted this to be SemVer-compliant, but it was simpler not to.
# This is just for testing, it doesn't need to strictly follow SemVer.
.version |= split("-")[0] + "-preview-\($hash)"
