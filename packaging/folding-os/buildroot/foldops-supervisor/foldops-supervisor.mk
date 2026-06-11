################################################################################
#
# foldops-supervisor — reference Buildroot package for pacificnm/folding-os
#
################################################################################

include $(sort $(wildcard $(dir $(lastword $(MAKEFILE_LIST)))../foldops-common.mk))

FOLDOPS_SUPERVISOR_VERSION = $(FOLDOPS_VERSION)
FOLDOPS_SUPERVISOR_SITE = $(FOLDOPS_SITE)
FOLDOPS_SUPERVISOR_SITE_METHOD = $(FOLDOPS_SITE_METHOD)
FOLDOPS_SUPERVISOR_LICENSE = $(FOLDOPS_LICENSE)
FOLDOPS_SUPERVISOR_LICENSE_FILES = $(FOLDOPS_LICENSE_FILES)

FOLDOPS_SUPERVISOR_DEPENDENCIES = $(FOLDOPS_HOST_CARGO_DEPENDENCIES) $(FOLDOPS_TARGET_DEPENDENCIES)

ifeq ($(BR2_FOLDOPS_CARGO_OFFLINE),y)
FOLDOPS_SUPERVISOR_PRE_BUILD_HOOKS += FOLDOPS_CHECK_VENDOR_HOOK
endif

define FOLDOPS_SUPERVISOR_CHECK_WEB_HOOK
	test -f $(@D)/apps/supervisor/web/dist/index.html || \
		(echo "foldops-supervisor: apps/supervisor/web/dist missing — run npm run build:web or use a release tarball" && exit 1)
endef

FOLDOPS_SUPERVISOR_PRE_BUILD_HOOKS += FOLDOPS_SUPERVISOR_CHECK_WEB_HOOK

define FOLDOPS_SUPERVISOR_BUILD_CMDS
	$(FOLDOPS_CARGO_BUILD) -p foldops-supervisor
endef

define FOLDOPS_SUPERVISOR_INSTALL_TARGET_CMDS
	$(INSTALL) -D -m 0755 $(FOLDOPS_SUPERVISOR_BIN) $(TARGET_DIR)/usr/bin/foldops-supervisor
	$(INSTALL) -D -m 0644 $(@D)/systemd/rust/foldops-supervisor.service \
		$(TARGET_DIR)/usr/lib/systemd/system/foldops-supervisor.service
	$(INSTALL) -D -m 0644 $(@D)/packaging/folding-os/env/supervisor.env.example \
		$(TARGET_DIR)/etc/foldops/supervisor.env.example
	$(INSTALL) -D -m 0644 $(@D)/packaging/folding-os/sysusers.d/foldops.conf \
		$(TARGET_DIR)/usr/lib/sysusers.d/foldops.conf
	$(INSTALL) -D -m 0644 $(@D)/packaging/folding-os/tmpfiles.d/foldops.conf \
		$(TARGET_DIR)/usr/lib/tmpfiles.d/foldops.conf
	$(INSTALL) -d -m 0755 $(TARGET_DIR)/usr/share/foldops/web
	cp -a $(@D)/apps/supervisor/web/dist/. $(TARGET_DIR)/usr/share/foldops/web/
endef

$(eval $(generic-package))
