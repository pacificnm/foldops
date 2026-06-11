################################################################################
#
# foldops-agent — reference Buildroot package for pacificnm/folding-os
#
# Install into folding-os:
#   build/packages/foldops-agent/{Config.in,foldops-agent.mk}
# Source foldops-common.mk from your tree (copy or include path).
#
################################################################################

include $(sort $(wildcard $(dir $(lastword $(MAKEFILE_LIST)))../foldops-common.mk))

FOLDOPS_AGENT_VERSION = $(FOLDOPS_VERSION)
FOLDOPS_AGENT_SITE = $(FOLDOPS_SITE)
FOLDOPS_AGENT_SITE_METHOD = $(FOLDOPS_SITE_METHOD)
FOLDOPS_AGENT_LICENSE = $(FOLDOPS_LICENSE)
FOLDOPS_AGENT_LICENSE_FILES = $(FOLDOPS_LICENSE_FILES)

FOLDOPS_AGENT_DEPENDENCIES = $(FOLDOPS_HOST_CARGO_DEPENDENCIES) $(FOLDOPS_TARGET_DEPENDENCIES)

ifeq ($(BR2_FOLDOPS_CARGO_OFFLINE),y)
FOLDOPS_AGENT_PRE_BUILD_HOOKS += FOLDOPS_CHECK_VENDOR_HOOK
endif

define FOLDOPS_AGENT_BUILD_CMDS
	$(FOLDOPS_CARGO_BUILD) -p foldops-agent
endef

define FOLDOPS_AGENT_INSTALL_TARGET_CMDS
	$(INSTALL) -D -m 0755 $(FOLDOPS_AGENT_BIN) $(TARGET_DIR)/usr/bin/foldops-agent
	$(INSTALL) -D -m 0644 $(@D)/systemd/rust/foldops-agent.service \
		$(TARGET_DIR)/usr/lib/systemd/system/foldops-agent.service
	$(INSTALL) -D -m 0644 $(@D)/packaging/folding-os/env/agent.env.example \
		$(TARGET_DIR)/etc/foldops/agent.env.example
endef

$(eval $(generic-package))
