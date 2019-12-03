import {
    Aspect,
    FP,
    sha256,
} from "@atomist/sdm-pack-fingerprint";
import { coerce } from "semver";

const GradleWrapper = "gradle-wrapper";

export interface GradleWrapperInformation {
    distributionUrl: string;
    version: string;
}

export const GradleWrapperVersion: Aspect<GradleWrapperInformation> = {
    name: GradleWrapper,
    displayName: "Gradle wrapper version",
    extract: async p => {
        if (p.hasFile("gradle/wrapper/gradle-wrapper.properties")) {
            const content = await (await p.getFile("gradle/wrapper/gradle-wrapper.properties"))!.getContent();
            const distributionMatch = content.match(/^distributionUrl=(.*)$/gm);
            if (distributionMatch) {
                const versionRegex = /.*-((\d|\.)+)-(bin|all)\.zip\s*/;
                const url = distributionMatch[0];
                const versionMatch = url.match(versionRegex);
                if (versionMatch) {
                    const wrapperVersion = coerce(versionMatch[1]) ? versionMatch[1] : coerce(versionMatch[1]);
                    const data: GradleWrapperInformation = {
                        distributionUrl: url,
                        version: wrapperVersion!.toString(),
                    };
                    const fp: FP = {
                        name: `gradle-wrapper`,
                        version: "1.0.0",
                        type: GradleWrapper,
                        abbreviation: "gradle-wrapper",
                        displayType: "Gradle wrapper",
                        data,
                        sha: sha256(JSON.stringify(data)),
                    };
                    return fp;
                } else {
                    const data: GradleWrapperInformation = {
                        distributionUrl: url,
                        version: "custom",
                    };
                    const fp: FP = {
                        name: `gradle-wrapper`,
                        version: "1.0.0",
                        type: GradleWrapper,
                        abbreviation: "gradle-wrapper",
                        displayType: "Gradle wrapper",
                        data,
                        sha: sha256(JSON.stringify(data)),
                    };
                    return fp;
                }
            } else {
                return [];
            }
        } else {
            return [];
        }
    },
    toDisplayableFingerprintName: name => name,
    toDisplayableFingerprint: fp => !fp.data.version ? "custom" : fp.data.version,

};
