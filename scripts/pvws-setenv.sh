# Container-side setenv.sh override (bind-mounted by scripts/start-pvws.sh
# over the stock /usr/local/tomcat/bin/setenv.sh inside the pvws image).
#
# The stock setenv.sh hardcodes EPICS_CA_ADDR_LIST=164.54.112.168, which
# clobbers any value passed via `podman run -e EPICS_CA_ADDR_LIST=...`
# because Tomcat sources setenv.sh after reading the container env.
# This file replaces it with a no-op so the -e value survives.
#
# All pvws/EPICS configuration now lives in scripts/start-pvws.sh as
# explicit `-e` flags. Don't add hardcoded values here.
