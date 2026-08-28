import { gitCommit, gitCommitAndTag, gitTag } from "@rnv/build-hooks-git";
import { generateSchema } from "@rnv/build-hooks-schema";
import { comparePluginOverrides } from "./comparePluginOverrides";
import { comparePluginTemplates } from "./comparePluginTemplates";
import { prePublish } from "./prePublish";
import { resetOverrides } from "./resetOverrides";

const hooks = {
	prePublish,
	comparePluginTemplates,
	comparePluginOverrides,
	gitCommitAndTag,
	gitCommit,
	gitTag,
	generateSchema,
	resetOverrides,
};

const pipes = {};

export { hooks, pipes };
