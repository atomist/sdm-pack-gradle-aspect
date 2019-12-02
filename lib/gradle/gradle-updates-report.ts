import { logger } from "@atomist/automation-client";
import { existsSync } from "fs";
import {
    readFile,
    writeFile,
} from "fs-extra";
import { join } from "path";

const GRADLE_DEPENDENCY_REPORT_FILENAME = "gradle-dependency-report.json";

interface GradleProject {
    project: string;
    repositories: string[];
    dependencies: GradleDependency[];
}

interface GradleDependency {
    name: string;
    group: string;
    version: string;
}

type GradleDependencyWithRepos = GradleDependency & { repos: string[] };

export interface BuildDependency {
    name: string;
    depGroup: string;
    depName?: string;
    currentValue?: string;
    registryUrls?: string[];
}

async function createAtomistGradlePlugin(localDir: string): Promise<void> {
    const content = `
import groovy.json.JsonOutput
import org.gradle.api.internal.artifacts.dependencies.DefaultExternalModuleDependency
import java.util.concurrent.ConcurrentLinkedQueue

def output = new ConcurrentLinkedQueue<>();

allprojects {
  tasks.register("atomist") {
    doLast {
        def project = ['project': project.name]
        output << project
        def repos = (repositories + settings.pluginManagement.repositories)
           .collect { "$it.url" }
           .findAll { !it.startsWith('file:') }
           .unique()
        project.repositories = repos
        def deps = (buildscript.configurations + configurations)
          .collect { it.dependencies }
          .flatten()
          .findAll { it instanceof DefaultExternalModuleDependency }
          .collect { ['name':it.name, 'group':it.group, 'version':it.version] }
        project.dependencies = deps
    }
  }
}

gradle.buildFinished {
   def outputFile = new File('${GRADLE_DEPENDENCY_REPORT_FILENAME}')
   def json = JsonOutput.toJson(output)
   outputFile.write json
}`;
    const gradleInitFile = join(localDir, "atomist-dependency-plugin.gradle");
    logger.debug(
        "Creating atomist-dependency-plugin.gradle file with renovate gradle plugin",
    );
    await writeFile(gradleInitFile, content);
}

async function readGradleReport(localDir: string): Promise<GradleProject[]> {
    const renovateReportFilename = join(
        localDir,
        GRADLE_DEPENDENCY_REPORT_FILENAME,
    );
    if (!(existsSync(renovateReportFilename))) {
        return [];
    }

    const contents = await readFile(renovateReportFilename, "utf8");
    try {
        return JSON.parse(contents);
    } catch (err) {
        logger.error("Invalid JSON", { err });
        return [];
    }
}

function mergeDependenciesWithRepositories(
    project: GradleProject,
): GradleDependencyWithRepos[] {
    if (!project.dependencies) {
        return [];
    }
    return project.dependencies.map(dep => ({
        ...dep,
        repos: [...project.repositories],
    }));
}

function flattenDependencies(
    accumulator: GradleDependencyWithRepos[],
    currentValue: GradleDependencyWithRepos[],
): GradleDependencyWithRepos[] {
    accumulator.push(...currentValue);
    return accumulator;
}

function combineReposOnDuplicatedDependencies(
    accumulator: GradleDependencyWithRepos[],
    currentValue: GradleDependencyWithRepos,
): GradleDependencyWithRepos[] {
    const existingDependency = accumulator.find(
        dep => dep.name === currentValue.name && dep.group === currentValue.group,
    );
    if (!existingDependency) {
        accumulator.push(currentValue);
    } else {
        const nonExistingRepos = currentValue.repos.filter(
            repo => existingDependency.repos.indexOf(repo) === -1,
        );
        existingDependency.repos.push(...nonExistingRepos);
    }
    return accumulator;
}

function buildDependency(
    gradleModule: GradleDependencyWithRepos,
): BuildDependency {
    return {
        name: gradleModule.name,
        depGroup: gradleModule.group,
        depName: `${gradleModule.group}:${gradleModule.name}`,
        currentValue: gradleModule.version,
        registryUrls: gradleModule.repos,
    };
}

async function extractDependenciesFromUpdatesReport(
    localDir: string,
): Promise<BuildDependency[]> {
    const gradleProjectConfigurations = await readGradleReport(localDir);

    const dependencies = gradleProjectConfigurations
        .map(mergeDependenciesWithRepositories, [])
        .reduce(flattenDependencies, [])
        .reduce(combineReposOnDuplicatedDependencies, []);

    return dependencies.map(buildDependency);
}

export {
    extractDependenciesFromUpdatesReport,
    createAtomistGradlePlugin,
    GRADLE_DEPENDENCY_REPORT_FILENAME,
};
