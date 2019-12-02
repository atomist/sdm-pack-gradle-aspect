import { LocalProject } from "@atomist/automation-client";
import { doWithFiles } from "@atomist/automation-client/lib/project/util/projectUtils";
import {
    spawnLog,
    StringCapturingProgressLog,
} from "@atomist/sdm";
import {
    Aspect,
    FP,
    sha256,
} from "@atomist/sdm-pack-fingerprint";
import * as fs from "fs-extra";
import { getGradleCommandLine } from "./executeGradle";
import {
    createAtomistGradlePlugin,
    extractDependenciesFromUpdatesReport,
} from "./gradle-updates-report";
import {
    GradleDependency,
    updateGradleVersion,
} from "./gradleBuildFile";

const GradleDirectDep = "gradle-direct-dep";

async function executeGradlePlugin(cwd: string) {
    const gradleCommand = await getGradleCommandLine(cwd);
    const log = new StringCapturingProgressLog();
    await spawnLog(gradleCommand, ["--init-script", "atomist-dependency-plugin.gradle", "atomist"],
        { log, logCommand: false, cwd});
}

export const GradleDirectDependencies: Aspect<GradleDependency> = {
    name: GradleDirectDep,
    displayName: "Gradle declared dependencies",
    extract: async p => {
        const localProject = p as LocalProject;
        if (p.hasFile("build.gradle") || p.hasFile("build.gradle.kts")) {
            await createAtomistGradlePlugin(localProject.baseDir);
            await executeGradlePlugin(localProject.baseDir);
            const buildDependencies = await extractDependenciesFromUpdatesReport(localProject.baseDir);
            const fps: Array<FP<GradleDependency>> =  buildDependencies.map(bd => {
                const gd: GradleDependency = {
                    group: bd.depGroup,
                    name: bd.name,
                    version: bd.currentValue,
                };
                return gd;
            }).map(gd => {
                const fp: FP = {
                    name: "gradle-direct-dep",
                    version: "1.0.0",
                    type: "gradle-direct-dep",
                    abbreviation: "gradle",
                    displayType: "Gradle dependency",
                    data: gd,
                    sha: sha256(JSON.stringify(gd)),
                };
                return fp;
            });
            return fps;
        } else {
            return [];
        }
    },
    apply: async (p, papi, params) => {
        if (params) {
            const targetFP = params.fp;
            const newVersion = targetFP.data.version ? targetFP.data.version : "";
            await doWithFiles(p, "**/build{*.gradle,*.gradle.kts}", async f => {
                const fileContent = await fs.readFile(f.path, "UTF-8");
                const newContent = updateGradleVersion(fileContent, {group: targetFP.data.group, name: targetFP.data.name}, newVersion);
                await fs.writeFile(f.path, newContent, {encoding: "UTF-8"});
            });
        }
    },

};
