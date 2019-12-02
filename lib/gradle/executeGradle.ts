/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    LocalProject,
    Project,
} from "@atomist/automation-client";
import {
    access,
    constants,
    existsSync,
} from "fs";
import { platform } from "os";
import * as path from "path";
import { promisify } from "util";

export async function determineGradleCommand(p: Project): Promise<string> {
    return getGradleCommandLine((p as LocalProject).baseDir);
}

async function canExecute(exec: string): Promise<boolean> {
    try {
        await promisify(access)(exec, constants.X_OK);
        return true;
    } catch {
        return false;
    }
}

export interface GradleCommandConfig {
    source: "docker" | "binary";
    dockerBaseImage: string;
}

export async function getGradleCommandLine(
    cwd: string,
    config?: GradleCommandConfig,
): Promise<string> {
    const defaultConfig: GradleCommandConfig = {
        source: "binary",
        dockerBaseImage: "gradle:6.0-jdk8",
    };
    const configToUse: GradleCommandConfig = {
        ...defaultConfig,
        ...config,
    };
    let cmd: string;
    const gradlewPath = path.join(cwd, "gradlew");
    const gradlewExists = await existsSync(gradlewPath);
    const gradlewExecutable = gradlewExists && (await canExecute(gradlewPath));
    const gradlewBatPath = path.join(cwd, "gradlew.bat");
    const gradlewBatExists = await existsSync(gradlewBatPath);

    if (configToUse.source === "docker") {
        cmd = `docker run --rm `;
        cmd += `-v "${cwd}":"${cwd}" -w "${cwd}" `;
        cmd += `${configToUse.dockerBaseImage} gradle`;
    }
    if (gradlewBatExists && platform() === "win32" ) {
        cmd = "gradlew.bat";
    } else if (gradlewExecutable) {
        cmd = "./gradlew";
    } else if (gradlewExists) {
        cmd = "sh gradlew";
    } else {
        cmd = "gradle";
    }
    return cmd;
}
