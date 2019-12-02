import { BuildDependency } from "./gradle-updates-report";

let variables: Record<string, string> = {};

export interface GradleDependency {
    group: string;
    name: string;
    version?: string;
}

type UpdateFunction = (
        dependency: GradleDependency,
        buildGradleContent: string,
        newVersion: string,
    ) => string | undefined;

function moduleStringVersionFormatMatch(dependency: GradleDependency): RegExp {
    return /(["']${dependency.group}:${dependency.name}:)[^$].*?(([:@].*?)?["'])`/;
}

function groovyPluginStringVersionFormatMatch(dependency: GradleDependency): RegExp {
    return new RegExp(`(id\\s+["']${dependency.group}["']\\s+version\\s+["'])[^$].*?(["'])`);
}

function kotlinPluginStringVersionFormatMatch(dependency: GradleDependency): RegExp {
    return new RegExp(`(id\\("${dependency.group}"\\)\\s+version\\s+")[^$].*?(")`);
}

function moduleMapVersionFormatMatch(dependency: GradleDependency): RegExp {
    return new RegExp(
        `(group\\s*:\\s*["']${dependency.group}["']\\s*,\\s*` +
        `name\\s*:\\s*["']${dependency.name}["']\\s*,\\s*` +
        `version\\s*:\\s*["']).*?(["'])`,
    );
}

function moduleKotlinNamedArgumentVersionFormatMatch(dependency: GradleDependency): RegExp {
    // prettier-ignore
    return new RegExp(
        `(group\\s*=\\s*"${dependency.group}"\\s*,\\s*` +
        `name\\s*=\\s*"${dependency.name}"\\s*,\\s*` +
        `version\\s*=\\s*").*?(")`,
    );
}

function moduleMapVariableVersionFormatMatch(dependency: GradleDependency): RegExp {
    return new RegExp(
        `group\\s*:\\s*["']${dependency.group}["']\\s*,\\s*` +
        `name\\s*:\\s*["']${dependency.name}["']\\s*,\\s*` +
        `version\\s*:\\s*([^\\s"')]+)\\s*`,
    );
}

function moduleKotlinNamedArgumentVariableVersionFormatMatch(dependency: GradleDependency): RegExp {
    return new RegExp(
        `group\\s*=\\s*"${dependency.group}"\\s*,\\s*` +
        `name\\s*=\\s*"${dependency.name}"\\s*,\\s*` +
        `version\\s*=\\s*([^\\s"]+?)[\\s\\),]`,
    );
}

function moduleStringVariableInterpolationVersionFormatMatch(dependency: GradleDependency): RegExp {
    return new RegExp(`["']${dependency.group}:${dependency.name}:\\$([^{].*?)["']`);
}

function moduleStringVariableExpressionVersionFormatMatch(dependency: GradleDependency): RegExp {
    return new RegExp(`["']${dependency.group}:${dependency.name}:\\$\{([^{].*?)}["']`);
}

function variableDefinitionFormatMatch(variable: string): RegExp {
    return new RegExp(`(${variable}\\s*=\\s*?["'])(.*)(["'])`);
}

export function collectVersionVariables(
    dependencies: BuildDependency[],
    buildGradleContent: string,
): void {
    for (const dep of dependencies) {
        const dependency: GradleDependency = {
            ...dep,
            group: dep.depGroup,
        };
        const regexes = [
            moduleStringVariableExpressionVersionFormatMatch(dependency),
            moduleStringVariableInterpolationVersionFormatMatch(dependency),
            moduleMapVariableVersionFormatMatch(dependency),
            moduleKotlinNamedArgumentVariableVersionFormatMatch(dependency),
        ];

        for (const regex of regexes) {
            const match = buildGradleContent.match(regex);
            if (match) {
                variables[`${dependency.group}:${dependency.name}`] = match[1];
            }
        }
    }
}

export function init(): void {
    variables = {};
}

function updateVersionLiterals(
    dependency: GradleDependency,
    buildGradleContent: string,
    newVersion: string,
): string | undefined {
    const regexes: RegExp[] = [
        moduleStringVersionFormatMatch(dependency),
        groovyPluginStringVersionFormatMatch(dependency),
        kotlinPluginStringVersionFormatMatch(dependency),
        moduleMapVersionFormatMatch(dependency),
        moduleKotlinNamedArgumentVersionFormatMatch(dependency),
    ];
    for (const regex of regexes) {
        if (buildGradleContent.match(regex)) {
            return buildGradleContent.replace(regex, `$1${newVersion}$2`);
        }
    }
    return undefined;
}

function updateLocalVariables(
    dependency: GradleDependency,
    buildGradleContent: string,
    newVersion: string,
): string | undefined {
    const regexes: RegExp[] = [
        moduleMapVariableVersionFormatMatch(dependency),
        moduleStringVariableInterpolationVersionFormatMatch(dependency),
        moduleStringVariableExpressionVersionFormatMatch(dependency),
        moduleKotlinNamedArgumentVariableVersionFormatMatch(dependency),
    ];
    for (const regex of regexes) {
        const match = buildGradleContent.match(regex);
        if (match) {
            return buildGradleContent.replace(
                variableDefinitionFormatMatch(match[1]),
                `$1${newVersion}$3`,
            );
        }
    }
    return undefined;
}

function updateGlobalVariables(
    dependency: GradleDependency,
    buildGradleContent: string,
    newVersion: string,
): string | undefined {
    const variable = variables[`${dependency.group}:${dependency.name}`];
    if (variable) {
        const regex = variableDefinitionFormatMatch(variable);
        const match = buildGradleContent.match(regex);
        if (match) {
            return buildGradleContent.replace(
                variableDefinitionFormatMatch(variable),
                `$1${newVersion}$3`,
            );
        }
    }
    return undefined;
}

function updateKotlinVariablesByExtra(
    dependency: GradleDependency,
    buildGradleContent: string,
    newVersion: string,
): string | undefined {
    const variable = variables[`${dependency.group}:${dependency.name}`];
    if (variable) {
        const regex = new RegExp(
            `(val ${variable} by extra(?: {|\\()\\s*")(.*)("\\s*[})])`,
        );
        const match = buildGradleContent.match(regex);
        if (match) {
            return buildGradleContent.replace(regex, `$1${newVersion}$3`);
        }
    }
    return undefined;
}

function updatePropertyFileGlobalVariables(
    dependency: GradleDependency,
    buildGradleContent: string,
    newVersion: string,
): string | undefined {
    const variable = variables[`${dependency.group}:${dependency.name}`];
    if (variable) {
        const regex = new RegExp(`(${variable}\\s*=\\s*)(.*)`);
        const match = buildGradleContent.match(regex);
        if (match) {
            return buildGradleContent.replace(regex, `$1${newVersion}`);
        }
    }
    return undefined;
}

export function updateGradleVersion(
    buildGradleContent: string,
    dependency: GradleDependency,
    newVersion: string,
): string {
    if (dependency) {
        const updateFunctions: UpdateFunction[] = [
            updateVersionLiterals,
            updateLocalVariables,
            updateGlobalVariables,
            updatePropertyFileGlobalVariables,
            updateKotlinVariablesByExtra,
        ];
        for (const updateFunction of updateFunctions) {
            const gradleContentUpdated = updateFunction(
                dependency,
                buildGradleContent,
                newVersion,
            );
            if (gradleContentUpdated) {
                return gradleContentUpdated;
            }
        }
    }
    return buildGradleContent;
}
