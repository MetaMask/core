#!/bin/sh

exec find packages \( -name dist -or -name tsconfig.tsbuildinfo -or -name tsconfig.build.tsbuildinfo \) -print0 | xargs -I {} -0 rm -rf {}
